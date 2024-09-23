import {Readable} from "stream";

export class Stream extends Readable{
    _read(_: number) {
        // No implementation needed for pushing data manually
    }
    incomming(message = ''): void {
        if(message.toString().startsWith('> 0041000')){
            message = '[CENSORED OUTGOING MESSAGE]\n';
        }
        this.push(`>> ${message.toString()}`);
    }
    outgoing(message = ''): void {
        if(message.startsWith('0041000')){
            message = '[CENSORED OUTGOING MESSAGE]\n';
        }
        this.push(`<< ${message}`);
    }
}