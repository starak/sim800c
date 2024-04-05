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

### Setup environment
You'll need to create a `.env` file in the root directory of the project. It should look like this:
```bash
DEBUG_SIM=true            # to enable debug messages
SERIAL_PORT=/dev/serial0  # or whatever your SIM800C is connected to
```