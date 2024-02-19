import {AtSerial} from "./at-serial";
import {Submit} from "node-pdu";
import Queue from "p-queue";
import {Message, RawMessagePDU, SIM800COptions} from "./types";
import {convertToCleanMessage, parsePDUMessage, processMessages,} from "./utils";
import CS from 'console-stamp';

const logger = new console.Console( process.stdout, process.stderr );
const CTRL_Z = '\x1a';

export class SIM800C extends AtSerial {
    private queue = new Queue({concurrency: 1});

    constructor(options: SIM800COptions) {
        super(options);
        CS( logger, {level: options.logLevel || 'warn'})
        this.on('_incomming_message', async (index: string) => {
            const message = await this.getMessage(+index);
            if(message){
                this.emit('message', message);
            }
        });
    }

    public async reset(): Promise<void> {
        const c = await this.sendCommand('ATZ');
        logger.debug(JSON.stringify(c));
        await this.rejectCalls();
    }

    public async rejectCalls(): Promise<void> {
        const c = await this.sendCommand('AT+GSMBUSY=1');
        logger.debug(JSON.stringify(c));
    }

    private async setPDUMode(): Promise<void> {
        const c = await this.sendCommand(`AT+CMGF=0`);
        logger.debug(JSON.stringify(c));
    }

    public async sendMessage(number: string, message: string) {
        return this.queue.add(async () => {
            message += "\u200B"; // Add zero-width space to the end of the message to force unicode as a workaround for the 7-bit bug in node-pdu.
            let submit = new Submit(number, message);
            submit.dataCodingScheme.setUseMessageClass(false);
            const parts = submit.getPartStrings();
            await this.reset();
            await this.setPDUMode();

            for (let i = 0; i < parts.length; i++) {
                const pdu = parts[i];
                const smscInfoLength = (parseInt(pdu.substring(0, 2), 16) + 1) * 2;
                const userDataLength = (pdu.length - smscInfoLength) / 2;
                const command = `AT+CMGS=${userDataLength} > ${pdu}`;
                const terminator = `\r > ${CTRL_Z}`;
                const c = await this.sendCommand(command, terminator);
                logger.debug(JSON.stringify(c));
            }
        }).catch(e => {
            throw e;
        });
    }

    public async getAllPDUMessages(): Promise<RawMessagePDU[]> {
        await this.reset();
        await this.setPDUMode();
        const data = await this.sendCommand('AT+CMGL=4');
        logger.debug(JSON.stringify(data));
        const response = data.response.split('\r\n').filter(Boolean).slice(0,-1);
        let messages: RawMessagePDU[] = [];
        let current = {} as RawMessagePDU;
        for (const line of response) {
            if(line.startsWith('+CMGL: ')){
                const [index] = line.replace(/^\+CMGL:\s/, '').split(',');
                current = {index: +index, raw: ''};
                messages.push(current);
            }else{
                current.raw += line.replace(/\s/g, '');
            }
        }

        return messages;
    }

    public async getMessages(): Promise<Message[]> {
        return this.queue.add(async () => {
            const rawMessages = await this.getAllPDUMessages();
            const parsedMessages = rawMessages.map(parsePDUMessage);
            const processedMessages = processMessages(parsedMessages);
            return processedMessages.map(convertToCleanMessage);
        });
    }

    public async getMessage(index: number): Promise<Message> {
        const messages = await this.getMessages();
        let message = messages.find(m => m?.index === index) || messages.find(m => m?.indexes?.find(m2 => m2 === index));
        return message as Message || undefined;
    }

    public async deleteMessage(msg: Message): Promise<void> {
        return this.queue.add(async () => {
            if (!msg) return;
            for (const i of msg.indexes) {
                const c = await this.sendCommand(`AT+CMGD=${i}`);
                logger.debug(JSON.stringify(c));
            }
        });
    }

    public async deleteAllMessages(): Promise<void> {
        const c = this.queue.add(async () => this.sendCommand('AT+CMGD=1,4'));
        logger.debug(JSON.stringify(c));
    }
}