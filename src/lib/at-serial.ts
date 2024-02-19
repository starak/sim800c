import {SerialPort} from "serialport";
import {ReadlineParser as Readline} from '@serialport/parser-readline';
import EventEmitter from "eventemitter3";
import Queue from "p-queue";
import {Stream} from "./stream";
import {PORT_OPTIONS, SendCommandResponse} from "./types";

const DEFAULT_PORT_OPTIONS: PORT_OPTIONS = {
    baudRate : 115200,
    dataBits : 8,
    stopBits : 1,
    parity   : 'none',
    line_end : '\r\n',
    read_time: 1000,
    path     : '',
};

export class AtSerial extends EventEmitter{
    private readonly options: PORT_OPTIONS;
    public serialStream = new Stream();
    private port: SerialPort | undefined;
    private parser: Readline | undefined;
    private commandQueue: Queue = new Queue({concurrency: 1});
    constructor( options = {}){
        super();
        this.options = Object.assign({}, DEFAULT_PORT_OPTIONS, options);
    }

    public open (): Promise<void> {
        return new Promise((resolve, reject) => {
            this.port = new SerialPort(this.options);
            this.parser = new Readline({ delimiter: '\r\n' });
            this.parser.on('data', (data) => {
                this.serialStream.incomming(data+'\n');
                if (/\+CMTI:/.test(data)) { // Incoming Message
                    const index = data.split(',')[1];
                    this.emit('_incomming_message', index);
                }
            });

            this.port.pipe(this.parser);
            this.port.on('open', () => void resolve());
            this.port.on('error', err => void reject(err));
        });
    }

    public close (): Promise<void> {
        return new Promise((resolve, reject) => {
            this.port?.unpipe();
            this.port?.close(err => err ? reject(err) : resolve());
        });
    }

    public async sendCommand(command: string, terminator = '\r', timeout = 30000): Promise<SendCommandResponse> {
        return this.commandQueue.add(() => new Promise((resolve, reject) => {
            const start = new Date();
            let end;
            const {port, parser} = this;
            const commands = command.split(/\s?>\s?/);
            const terminators = terminator.split(/\s?>\s?/);
            if (!port || !parser) {
                throw new Error('Port not open');
            }

            let commandTimeout: NodeJS.Timeout;
            let response: string[] = [];
            const listener = (chunkB: Buffer) => {
                const chunk = chunkB.toString();
                response.push(chunk);
                if (chunk.includes('ERROR')) {
                    clearTimeout(commandTimeout);
                    port.removeListener('data', listener);
                    reject(new Error('Command error'));
                    return;
                }

                if (chunk.includes('OK')) {
                    clearTimeout(commandTimeout);
                    port.removeListener('data', listener);
                    end = new Date();
                    resolve({
                        command,
                        start,
                        end,
                        executionTime: end.getTime() - start.getTime(),
                        response: response.join('\n'),
                    });
                }

                if (chunk.includes('>') && commands.length > 1) {
                    const c = `${commands[1]}${terminators[1]}`;
                    this.serialStream.outgoing(c);
                    port.write(c);
                }

            };

            port.on('data', listener);
            const c = `${commands[0]}${terminators[0]}`;
            this.serialStream.outgoing(c.replace(/\r/g,'\n'));
            port.write(c);

            commandTimeout = setTimeout(() => {
                port.removeListener('data', listener);
                reject(new Error('Command timeout:' + command));
            }, timeout);

        }));
    }
}