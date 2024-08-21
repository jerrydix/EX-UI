const WebSocket = require('ws');

const ws = new WebSocket(`wss://exui.moritzeisert.de:9002`, {
    rejectUnauthorized: true
  });

  ws.on('open', function open() {
    ws.send('All glory to WebSockets!');
  });
  ws.onmessage = function (msg) {
    console.log(JSON.parse(msg.data).value)
  }