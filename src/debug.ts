import console_stamp from 'console-stamp';

export const logger_out = new console.Console(process.stdout, process.stderr);
export const logger_in = new console.Console(process.stdout, process.stderr);

console_stamp(logger_out, {
    format: '([<-]).white :debug.cyan',
    level: process.env.DEBUG_SIM ? 'debug' : 'error',
    tokens: {
        debug: ({msg}) => msg.replace(/\r\n/g, '\n')
            .replace(/\r/g, '')
    },
    preventDefaultMessage: true
});

console_stamp(logger_in, {
    format: '([->]).white :debug.green',
    level: process.env.DEBUG_SIM ? 'debug' : 'error',
    tokens: {
        debug: ({msg}) => msg.replace(/\r\n/g, '\n')
            .replace(/\r/g, '')
    },
    preventDefaultMessage: true
});

logger_in.debug('Debugging is enabled');