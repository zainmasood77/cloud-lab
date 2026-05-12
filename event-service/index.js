const express = require('express');
const { Pool } = require('pg');
const amqp = require('amqplib');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
app.use(express.json());

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'cloudlab',
  user: process.env.DB_USER || 'labuser',
  password: process.env.DB_PASS || 'labpass123',
  port: 5432
});

pool.query(`
  CREATE TABLE IF NOT EXISTS events (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    user_id INT,
    created_at TIMESTAMP DEFAULT NOW()
  )
`);

function authMiddleware(req, res, next) {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET || 'secret123');
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

async function publishEvent(event) {
  try {
    const conn = await amqp.connect(process.env.RABBITMQ_URL || 'amqp://localhost');
    const ch = await conn.createChannel();
    await ch.assertQueue('notifications_queue', { durable: true });
    await ch.assertQueue('logs_queue', { durable: true });
    ch.sendToQueue('notifications_queue', Buffer.from(JSON.stringify(event)), { persistent: true });
    ch.sendToQueue('logs_queue', Buffer.from(JSON.stringify(event)), { persistent: true });
    setTimeout(() => conn.close(), 500);
  } catch (err) {
    console.error('RabbitMQ publish error:', err.message);
  }
}

app.post('/events', authMiddleware, async (req, res) => {
  try {
    const { title, description } = req.body;
    const result = await pool.query(
      'INSERT INTO events (title, description, user_id) VALUES ($1, $2, $3) RETURNING *',
      [title, description, req.user.userId]
    );
    const event = result.rows[0];
    await publishEvent(event);
    res.status(201).json({ message: 'Event created', event });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/events', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM events ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/health', (req, res) => res.json({ status: 'Event service running' }));

app.listen(3002, () => console.log('Event service running on port 3002'));
