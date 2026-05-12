const express = require('express');
const amqp = require('amqplib');
require('dotenv').config();

const app = express();
app.use(express.json());

const notifications = [];

async function consumeEvents() {
  try {
    const conn = await amqp.connect(process.env.RABBITMQ_URL || 'amqp://localhost');
    const ch = await conn.createChannel();
    await ch.assertQueue('notifications_queue', { durable: true });
    ch.prefetch(1);
    console.log('Waiting for messages...');
    ch.consume('notifications_queue', (msg) => {
      if (msg !== null) {
        const event = JSON.parse(msg.content.toString());
        console.log('Received event:', event);
        notifications.push({ ...event, notified_at: new Date().toISOString() });
        ch.ack(msg);
      }
    });
  } catch (err) {
    console.error('Consumer error:', err.message);
    setTimeout(consumeEvents, 5000);
  }
}

consumeEvents();

app.get('/notifications', (req, res) => res.json(notifications));
app.get('/health', (req, res) => res.json({ status: 'Notification service running', count: notifications.length }));

app.listen(3003, () => console.log('Notification service running on port 3003'));
