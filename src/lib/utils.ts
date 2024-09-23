import {Message, RawMessagePDU, TempMessageParsed} from "./types";
import {Deliver, parse} from "node-pdu";

export function convertToCleanMessage(message?: TempMessageParsed): Message {
    if(message) {
        try {
            const senderPrefix = message.message.sender.length < 10 ? '' : '+';
            return {
                index: message.index,
                parts: message.message.parts || 1,
                indexes: message.message.parts_raw?.map(m => m.index) || [message.index],
                text: message.message.text,
                sender: senderPrefix + message.message.sender!,
                time: message.message.time,
            } as Message;
        } catch (e) {
            console.error(e, message);
            return {} as Message;
        }
    } else {
        return {} as Message;
    }
}

export function parsePDUMessage(msg: RawMessagePDU): TempMessageParsed {
    if(isValidHex(msg.raw)) {
        const pdu = parse(msg.raw) as Deliver;
        return {
            index: msg.index,
            message: {
                ...pdu.data.parts[0],
                time: pdu.serviceCenterTimeStamp.getIsoString(),
                sender: pdu.address.phone!,
            }
        }
    } else {
        return {
            error: 'Invalid hex string',
        } as TempMessageParsed;
    }
}

export function isValidHex(hexString = ''): boolean {
    const regex = /^[0-9A-Fa-f]+$/;
    return regex.test(hexString);
}

export function getRelatedMessages(currentMessage: TempMessageParsed, allMessages: TempMessageParsed[]): TempMessageParsed[] {
    return allMessages
        .filter(msg => msg.message?.header?.getPointer() === currentMessage.message?.header?.getPointer())
        .sort((a, b) => (a.message?.header?.getCurrent() || 0) - (b.message?.header?.getCurrent() || 0));
}

export function combineMessages(message: TempMessageParsed, parts: TempMessageParsed[]): TempMessageParsed {
    return {
        ...message,
        message: {
            ...message.message,
            text: parts.map(part => part?.message.text).join(''),
            multipart: true,
            parts: message.message.header?.getSegments(),
            parts_raw: parts as unknown as TempMessageParsed[]
        }
    };
}

export function processMessage(message: TempMessageParsed, allMessages: TempMessageParsed[]): TempMessageParsed | undefined {
    if (!message || message.error || !message.message || !message.message.header) {
        return {...message, message: {...message?.message, multipart: false, parts: 1}};
    }

    if (message.message.header.getCurrent() === 1) {
        const relatedMessages = getRelatedMessages(message, allMessages);
        if (relatedMessages.length < (message.message.header.getSegments() || 0)) {
            // Not all parts are present
            return undefined;
        }
        return combineMessages(message, relatedMessages);
    }

    return undefined;
}

export function processMessages(messages: TempMessageParsed[]): TempMessageParsed[] {
    const duplicates = findDuplicates(messages);
    if (duplicates.length) {
        console.log('Duplicates found', duplicates.map(d => d.index));
        messages = messages.filter(message => !duplicates.find(duplicate => duplicate.index === message.index));
    }
    return messages
        .map(message => processMessage(message, messages))
        .filter(message => message !== undefined) as TempMessageParsed[];
}

function findDuplicates(messages: TempMessageParsed[]): TempMessageParsed[] {
    const seenMessages: { [key: string]: TempMessageParsed } = {};
    const duplicates: TempMessageParsed[] = [];

    for (const message of messages) {
        const serializedMessage = JSON.stringify(message.message);

        if (seenMessages[serializedMessage]) {
            duplicates.push(message);
        } else {
            seenMessages[serializedMessage] = message;
        }
    }

    return duplicates;
}