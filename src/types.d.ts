import {pduMessage} from "pdu.ts";

export interface EpduMessage extends pduMessage{
    udh: Record<string, any>
    multipart: boolean,
    parts?: number,
    parts_raw?: GsmMessage[],
}

export interface GsmMessage{
    index: number;
    message: EpduMessage;
    raw: string;
    state: string;
}