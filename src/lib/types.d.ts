import {Header} from "node-pdu/dist/utils";

export interface Message {
    index: number;
    parts: number;
    indexes: number[];
    text: string;
    sender: string;
    time: string;
}

interface RawMessagePDU {
    index: number;
    raw: string;
}

interface TempMessage {
    time: string;
    sender: string;
    data: string;
    size: number;
    text: string;
    header: Header | null;
    multipart?: boolean,
    parts?: number,
    parts_raw?: TempMessageParsed[]
}

interface TempMessageParsed {
    index: number;
    message: TempMessage;
    error?: string
}

export interface PORT_OPTIONS {
    baudRate: number;
    dataBits: 7 | 8 | 5 | 6 | undefined;
    stopBits: 1 | 2 | undefined;
    parity: 'none' | 'even' | 'mark' | 'odd' | 'space';
    line_end: string;
    read_time: number;
    path: string;
}

export interface SendCommandResponse {
    command: string;
    start: Date;
    end: Date;
    waitFor?: string[];
    executionTime: number;
    response: string;
}

export interface SIM800COptions {
    path: string;
    baudRate?: number;
    logLevel?: 'debug' | 'info' | 'warn' | 'error';
}