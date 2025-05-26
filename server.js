import express from 'express';
import cors from 'cors';
import axios from 'axios';
import { WebSocketServer } from 'ws';
import readline from 'readline';
import http from 'http';


const app = express();
const port = 3000;

// Enable CORS for all routes
app.use(cors());

// Add health check route
app.get('/', (req, res) => {
  res.json({ status: 'Server is running' });
});

// Proxy route for GAIA API
app.get('/proxy', async (req, res) => {
    const url = req.query.url;
    if (!url) {
        return res.status(400).json({ error: 'URL parameter is required' });
    }

    try {
        const response = await axios.get(url);
        res.json(response.data);
    } catch (error) {
        console.error('Error fetching data:', error);
        res.status(500).json({ error: error.message });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something broke!' });
});

// Создание общего HTTP-сервера
const server = http.createServer(app);

// Запуск HTTP + WebSocket сервера
server.listen(port, () => {
  console.log(`✅ Server (HTTP + WebSocket) running at http://localhost:${port}`);
});

// 🔌 WebSocket чат поддержки
const wss = new WebSocketServer({ server });
const clients = new Map(); // ws → email

wss.on('connection', (ws) => {
  console.log('📡 WebSocket: клиент подключился');

  ws.on('message', (msg) => {
    try {
      const data = JSON.parse(msg);
      if (data.type === 'auth') {
        clients.set(ws, data.email);
        console.log(`✅ Авторизован: ${data.email}`);
      } else if (data.type === 'chat') {
        console.log(`[${clients.get(ws)}] 💬: ${data.message}`);
      }
    } catch (e) {
      console.log('⚠ Ошибка обработки сообщения:', e);
    }
  });

  ws.on('close', () => {
    console.log(`❌ Отключился: ${clients.get(ws)}`);
    clients.delete(ws);
  });
});

// Чтение из терминала (администратор отвечает всем)
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.on('line', (line) => {
  for (const [ws, email] of clients) {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({ from: 'admin', message: line }));
    }
  }
});