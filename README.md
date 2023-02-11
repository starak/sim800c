# SIM800C 
Simple library for sending and receiving messages with sim800c

### Installation
```bash
$ npm install @starak/sim800c
```

### Usage
```js
const {GSM, SerialPort} = require('@starak/sim800c');

(async () => {
    let SIM_PATH;
    await SerialPort.list().then((ports) => {
        const port = ports.find(p => p.path.includes('tty.usbserial'));
        if(port){
            console.log('Using SIM', port.path);
            SIM_PATH = port.path;
        }
    });

    if(SIM_PATH) {
        const gsm = new GSM(SIM_PATH);
        await gsm.ready();
        await gsm.sendMessage('55512345', 'Hello from SIM800C');
        console,log('Message sent');
        gsm.on('newMessage', async (message) => {
            console.log('newMessage', message);
            await gsm.deleteMessage(message.index);
        });
    }else{
        throw new Error('No SIM found');
    }
})();
```