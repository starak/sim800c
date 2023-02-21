import EventEmitter from "events";
import {SerialPort} from "serialport";
import {PDUParser, pduMessage} from "pdu.ts";
import {logger_in, logger_out} from "./debug";

interface UDH {
    parts: number,
    current_part: number,
    reference_number: string,
    length: string,
    iei: string,
}

interface EpduMessage extends pduMessage {
    udh?: UDH,
    multipart: boolean,
    parts: number,
    parts_raw?: GsmMessage[],
    sender?: string,
    senderType?: number,
    time: Date
}

interface GsmMessage {
    index: number;
    message: EpduMessage;
    raw: string;
}

export interface Message {
    index: number;
    parts: number;
    indexes: number[];
    text: string;
    sender: string;
    time: Date;
}

interface ParsedPDUMessage {
    index: number;
    message: EpduMessage;
}

interface PDUMessage {
    index: number;
    raw: string;
}

export * from "serialport";

export class GSM extends EventEmitter {
    port: SerialPort;
    _ready: Promise<void>;

    constructor(path: string) {
        super();
        this.port = new SerialPort({path: path, baudRate: 115200});
        this.port.on('open', async () => {
            await this.reset();
            this.emit('ready');
        });
        this.port.on('data', (data) => {
            logger_in.debug(data.toString());
            this.emit('data', data);
            setImmediate(() => this.onDataHandler(data));
        })
        this._ready = new Promise((resolve) => {
            this.on('ready', resolve);
        });
    }

    async ready(): Promise<void> {
        return this._ready;
    }

    private onDataHandler = async (data: Buffer) => {
        if (data.includes('+CMTI:')) { // Incoming Message
            const index = data.toString().split(',')[1];
            const message = await this.getMessage(+index);
            if (message) {
                if (message.parts === message.indexes.length) {
                    this.emit('newMessage', message);
                }
            } else {
                console.log('Error getting incoming message.', data.toString());
            }
        }
    }

    private async sendCommand(command: string, terminator = '\r'): Promise<void> {
        const {port} = this;
        return new Promise((resolve, reject) => {
            const listener = async (d: Buffer) => {
                data += d.toString();
                if (data.includes('OK') || data.includes('>')) {
                    port.removeListener('data', listener);
                    resolve();
                } else if (data.includes('ERROR')) {
                    port.removeListener('data', listener);
                    reject('error');
                } else {
                    //console.log('none', command, data);
                }
            }
            let data = '';
            port.on('data', listener);
            logger_out.debug(command + terminator);
            port.write(`${command}${terminator}`);
        });
    }

    public async reset(): Promise<void> {
        return this.sendCommand('ATZ');
    }

    private async setTextMode(): Promise<void> {
        return this.sendCommand('AT+CMGF=1');
    }

    private async setPDUMode(): Promise<void> {
        return this.sendCommand('AT+CMGF=0');
    }

    private async setRecipient(number: string): Promise<void> {
        return this.sendCommand(`AT+CMGS="${number}"`);
    }

    private async setMessage(message: string): Promise<void> {
        return this.sendCommand(`${message}`, '\x1a');
    }

    public async rejectCalls(): Promise<void> {
        return this.sendCommand('AT+GSMBUSY=1');
    }

    public async sendMessage(number: string, message: string) {
        await this.reset();
        await this.setTextMode();
        await this.setRecipient(number);
        await this.setMessage(message);
    }

    public async deleteMessage(msg: Message): Promise<void> {
        if(!msg) return;
        for (const i of msg.indexes) {
            await this.sendCommand(`AT+CMGD=${i}`);
        }
    }

    public async deleteAllMessages(): Promise<void> {
        return this.sendCommand('AT+CMGD=1,4');
    }

    async getAllPDUMessages(): Promise<PDUMessage[]> {
        await this.reset();
        await this.setPDUMode();
        const {port} = this;
        let data = '', msgs: PDUMessage[] = [], current = {} as PDUMessage;

        return new Promise((resolve, reject): PDUMessage[] | void => {
            const command = 'AT+CMGL=4\r';
            const listener = async (d: Buffer) => {
                data += d.toString();
                const lines = data.split('\r\n');
                data = lines.pop() || '';
                for (const line of lines) {
                    if (line.includes('OK')) {
                        port.removeListener('data', listener);
                        resolve(msgs);
                    } else if (line.includes('ERROR')) {
                        port.removeListener('data', listener);
                        reject();
                    } else if (line.startsWith('+CMGL: ')) {
                        const [index, , raw] = line.replace(/^\+CMGL:\s/, '')
                            .split(',')
                            .map(s => s.replace(/"/g, ''));
                        current = {index: +index, raw};
                        msgs.push(current);
                    } else {
                        current.raw += line;
                    }
                }
            }
            port.on('data', listener);
            port.write(command);
        });
    }

    parsePDUMessage(msg: PDUMessage): ParsedPDUMessage {
        return {
            index: msg.index,
            message: PDUParser.Parse(msg.raw)
        }
    }

    public async getMessages(): Promise<Message[]> {
        let messages = (await this.getAllPDUMessages().then(msgs => msgs.map(m => this.parsePDUMessage(m))));
        //console.log('msg count', messages.length);
        messages = messages.map(m => {
                if (m.message.udh) {
                    if (m.message.udh.current_part === 1) {
                        const parts = messages
                            .filter(m2 => m2.message.udh)
                            .filter(m2 => m2.message.udh?.reference_number === m.message.udh?.reference_number);
                        return {
                            ...m,
                            message: {
                                ...m.message,
                                text: parts.map(m2 => m2.message.text).join(''),
                                multipart: true,
                                parts: m.message.udh.parts,
                                parts_raw: parts
                            }
                        }
                    }
                    return undefined;
                }
                return {...m, multipart: false, message: {...m.message, parts: 1}};
            }).filter(m => m !== undefined) as GsmMessage[];
        return messages.map(m => GSM.convertToCleanMessage(m));
    }

    public async getMessage(index: number): Promise<Message> {
        const messages = await this.getMessages();
        let message = messages.find(m => m.index === index) || messages.find(m => m.indexes.find(m2 => m2 === index));
        return message as Message || undefined;
    }

    static convertToCleanMessage(message: ParsedPDUMessage): Message {
        const senderPrefix = message.message.senderType === 91 ? '' : '+';
        return {
            index: message.index,
            parts: message.message.parts,
            indexes: message.message.parts_raw?.map(m => m.index) || [message.index],
            text: message.message.text,
            sender: senderPrefix + message.message.sender!,
            time: message.message.time,
        }
    }
}