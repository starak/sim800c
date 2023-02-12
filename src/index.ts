import EventEmitter from "events";
import {SerialPort} from "serialport";
import {PDUParser, pduMessage} from "pdu.ts";
import console_stamp from 'console-stamp';

let logger = new console.Console(process.stdout, process.stderr);

console_stamp(logger, {
    format: '> :debug',
    level: process.env.DEBUG_SIM ? 'debug' : 'error',
    tokens: {
        debug: ({msg}) => msg.replace(/\r\n/g, '\n')
    },
    preventDefaultMessage: true
});

logger.debug('Debugging is enabled');

export interface EpduMessage extends pduMessage {
    udh: Record<string, any>
    multipart: boolean,
    parts?: number,
    parts_raw?: GsmMessage[],
    sender?: string,
    senderType?: number,
}

export interface GsmMessage {
    index: number;
    message: EpduMessage;
    raw: string;
    state: string;
}

export * from "serialport";

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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
            logger.debug(data.toString());
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
                if (message.message.multipart && (message.message.parts || 0) > (message.message.parts_raw?.length || 0)) {
                    // We need to wait for the rest of the message
                    await sleep(500);
                    setImmediate(() => this.onDataHandler(data));
                } else {
                    this.emit('newMessage', message);
                }
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

    public async sendMessage(number: string, message: string) {
        await this.reset();
        await this.setTextMode();
        await this.setRecipient(number);
        await this.setMessage(message);
    }

    public async deleteMessage(index: number): Promise<void> {
        const messages = await this.getMessages();
        const current = messages.find(m => m.index === index);
        let indexes: number[] = [];
        if (current && current.message.multipart) {
            indexes = current.message.parts_raw?.map(m => m.index) || [];
        } else if (current) {
            indexes = [index];
        }
        for (const i of indexes) {
            await this.sendCommand(`AT+CMGD=${i}`);
        }
    }

    public async deleteAllMessages(): Promise<void> {
        return this.sendCommand('AT+CMGD=1,4');
    }

    private async Messages(): Promise<GsmMessage[]> {
        await this.reset();
        await this.setPDUMode();
        const {port} = this;

        return new Promise((resolve, reject): GsmMessage[] | void => {
            let init = false;
            const listener = async (d: Buffer) => {
                data += d.toString();
                const lines = data.split('\r\n');
                data = lines.pop() || '';
                for (const line of lines) {
                    if (line.includes('OK')) {
                        if (!init) {
                            init = true;
                        } else {
                            port.removeListener('data', listener);
                            resolve(msgs.map(m => ({...m, message: PDUParser.Parse(m.raw)})) as GsmMessage[]);
                        }
                    } else if (line.includes('ERROR')) {
                        port.removeListener('data', listener);
                        reject();
                    } else if (line.startsWith('+CMGL: ')) {
                        const [index, state, raw] = line.replace(/^\+CMGL:\s/, '')
                            .split(',')
                            .map(s => s.replace(/"/g, ''));
                        current = {index: +index, state, raw, message: {} as EpduMessage};
                        msgs.push(current);
                        init = true;
                    } else {
                        current.raw += line;
                    }
                }
            }
            let data = '', msgs: GsmMessage[] = [], current = {} as GsmMessage;
            port.on('data', listener);
            port.write('AT+CMGL=4\r');
        });
    }

    public async getMessages(): Promise<GsmMessage[]> {
        const messages = await this.Messages();
        return messages.map(m => {
            if (m.message.udh) {
                if (m.message.udh.current_part === 1) {
                    const parts = messages
                        .filter(m2 => m2.message.udh)
                        .filter(m2 => m2.message.udh.reference_number === m.message.udh.reference_number);
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
            return {...m, multipart: false};
        }).filter(m => m !== undefined) as GsmMessage[];
    }

    public async getMessage(index: number): Promise<GsmMessage> {
        const messages = await this.getMessages();
        return messages.find(m => m.index === index) as GsmMessage;
    }
}