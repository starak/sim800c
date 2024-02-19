# SIM800C 
Simple library for sending and receiving messages with sim800c

## WIP! Do not use!

### Installation
```bash
$ npm install @starak/sim800c
```

### Usage
```js
const {SIM800C} = require('@starak/sim800c');

(async () => {
    const path = '/dev/serial0';

    const gsm = new SIM800C({path});
    await gsm.open();
    await gsm.sendMessage('55512345', 'Hello from SIM800C');
    console.log('Message sent');
    gsm.on('message', async (message) => {
        console.log('newMessage', message);
        await gsm.deleteMessage(message.index);
    });

})();
```