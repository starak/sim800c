import 'dotenv/config';
import {SIM800C} from "./src";

const logFileName = process.env.DEBUG_SIM ? `log/sim800c_${new Date().getDate()}.log` : '/dev/null';
const logStream = require('fs').createWriteStream(logFileName, {flags: 'a'});

(async function main() {
    console.log('Port:', process.env.SERIAL_PORT);
    const port = new SIM800C({path: process.env.SERIAL_PORT || '', logLevel: process.env.DEBUG_SIM === 'true' ? 'debug' : undefined});
    port.serialStream.pipe(logStream);
    await port.open();
    console.log('open');

    const msgs = await port.getMessages();
    console.log('messages:', msgs);
    // await port.deleteAllMessages();
    port.on('message', (msg) => {
        console.log('New Message: ', msg);
    });
    // close serial connection
    // await port.close();
})();