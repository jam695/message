const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const PORT = process.env.PORT || 8080;

const server = http.createServer((req, res) => {
  // Serve the client HTML and files from /public folder
  let filePath = './public/index.html';
  if (req.url && req.url !== '/') {
    filePath = path.join('./public', req.url);
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    let ext = path.extname(filePath).toLowerCase();
    let contentType = 'text/html';
    if (ext === '.js') contentType = 'application/javascript';
    else if (ext === '.css') contentType = 'text/css';
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

const wss = new WebSocket.Server({ server });

let clients = new Map(); // username => ws

wss.on('connection', (ws) => {
  let user = null;

  ws.on('message', (message) => {
    let data;
    try {
      data = JSON.parse(message);
    } catch {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
      return;
    }

    if (data.type === 'login') {
      if (!data.username) {
        ws.send(JSON.stringify({ type: 'login', success: false, error: 'Username required' }));
        return;
      }
      if (clients.has(data.username)) {
        ws.send(JSON.stringify({ type: 'login', success: false, error: 'Username taken' }));
        return;
      }
      user = data.username;
      clients.set(user, ws);
      ws.send(JSON.stringify({ type: 'login', success: true }));
      broadcastUserList();
      return;
    }

    if (!user) {
      ws.send(JSON.stringify({ type: 'error', message: 'Login first' }));
      return;
    }

    if (data.type === 'message') {
      const toUser = data.to;
      if (!toUser || !data.text) {
        ws.send(JSON.stringify({ type: 'error', message: 'Missing recipient or message' }));
        return;
      }
      const targetWs = clients.get(toUser);
      if (!targetWs) {
        ws.send(JSON.stringify({ type: 'error', message: `User ${toUser} not connected` }));
        return;
      }
      targetWs.send(JSON.stringify({
        type: 'message',
        from: user,
        text: data.text,
      }));

      targetWs.send(JSON.stringify({
        type: 'addUser',
        username: user,
      }));

      ws.send(JSON.stringify({
        type: 'addUser',
        username: toUser,
      }));
    }
  });

  ws.on('close', () => {
    if (user) {
      clients.delete(user);
      broadcastUserList();
    }
  });
});

function broadcastUserList() {
  const userList = Array.from(clients.keys());
  for (const ws of clients.values()) {
    ws.send(JSON.stringify({ type: 'userList', users: userList }));
  }
}

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
