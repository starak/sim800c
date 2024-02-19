import {Readable} from "stream";

export class Stream extends Readable{
    _read(_: number) {
        // No implementation needed for pushing data manually
    }
    incomming(message = ''): void {
        this.push(`>> ${message.toString().replace(/ /g,'\u2e31')}`);
    }
    outgoing(message = ''): void {
        this.push(`<< ${message.replace(/ /g,'\u2e31')}`);
    }
}