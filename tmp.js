const {GSM} = require("./dist/index");
const gsm = new GSM('/dev/tty.usbserial-2130');

(async () => {
    await gsm.ready().catch(err => console.log(err));
    console.log('Ready!');
//    console.log(await gsm.getMessage(6));
    const messages = await gsm.getMessages().then(msgs => {
        console.log(msgs)
        return msgs;
    });
//    await gsm.sendMessage('95139294', 'Test:'+new Date());
    gsm.on('newMessage', msg => console.log('new message:', msg));
   // await gsm.deleteMessage(messages.find(msg => msg.index === 4));
})();