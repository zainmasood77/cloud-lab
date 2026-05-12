const express = require('express');
const amqp = require('amqplib');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const LOGS_DIR = path.join(__dirname, 'logs');

async function logEvents() {
  try {
    const conn = await amqp.connect(process.env.RABBITMQ_URL || 'amqp://localhost');
    const ch = await conn.createChannel();
    await ch.assertQueue('logs_queue', { durable: true });
    ch.prefetch(1);
    ch.consume('logs_queue', (msg) => {
      if (msg !== null) {
        const event = JSON.parse(msg.content.toString());
        const date = new Date().toISOString().split('T')[0];
        const filename = path.join(LOGS_DIR, `events-${date}.json`);
        let logs = [];
        if (fs.existsSync(filename)) {
          logs = JSON.parse(fs.readFileSync(filename, 'utf8'));
        }
        logs.push({ ...event, logged_at: new Date().toISOString() });
        fs.writeFileSync(filename, JSON.stringify(logs, null, 2));
        console.log('Logged event:', event.id);
        ch.ack(msg);
      }
    });
  } catch (err) {
    console.error('Log error:', err.message);
    setTimeout(logEvents, 5000);
  }
}

logEvents();

app.get('/logs', (req, res) => {
  const files = fs.readdirSync(LOGS_DIR).filter(f => f.endsWith('.json'));
  const allLogs = files.flatMap(f => JSON.parse(fs.readFileSync(path.join(LOGS_DIR, f), 'utf8')));
  res.json(allLogs);
});

app.get('/health', (req, res) => res.json({ status: 'Event log service running' }));

app.listen(3004, () => console.log('Event log service running on port 3004'));
