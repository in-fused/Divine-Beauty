const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const request = require('supertest');

const testDb = path.join(__dirname, 'test.db');
if (fs.existsSync(testDb)) fs.unlinkSync(testDb);
process.env.DB_PATH = testDb;
process.env.ADMIN_PASSWORD = 'test-pass';
process.env.SESSION_SECRET = 'test-session-secret-long-enough';

const app = require('../src/server');
const { db } = require('../src/db');

test('GET / returns 200 and booking section', async () => {
  const response = await request(app).get('/');
  assert.equal(response.status, 200);
  assert.match(response.text, /Availability Calendar Blocks/);
});

test('GET /api/customer-lookup requires phone/email', async () => {
  const response = await request(app).get('/api/customer-lookup');
  assert.equal(response.status, 400);
});

test('GET /api/customer-lookup does not expose full customer record', async () => {
  db.prepare('INSERT INTO customers (name, phone, email, notes) VALUES (?, ?, ?, ?)').run('Client A', '5551234567', 'client@example.com', 'private notes');
  const response = await request(app).get('/api/customer-lookup?phone=5551234567');
  assert.equal(response.status, 200);
  assert.equal(response.body.found, true);
  assert.equal(response.body.profile.name, 'Client A');
  assert.equal(response.body.profile.email, undefined);
  assert.equal(response.body.profile.notes, undefined);
});

test('POST /bookings rejects invalid services without creating orphan booking', async () => {
  const slot = db.prepare('SELECT id FROM availability_slots ORDER BY id ASC LIMIT 1').get();
  const before = db.prepare('SELECT COUNT(*) as count FROM bookings').get().count;

  const response = await request(app)
    .post('/bookings')
    .type('form')
    .send({
      slotId: String(slot.id),
      name: 'Client B',
      phone: '5557654321',
      email: 'clientb@example.com',
      customNotes: 'testing',
      services: ['999999']
    });

  assert.equal(response.status, 400);
  const after = db.prepare('SELECT COUNT(*) as count FROM bookings').get().count;
  assert.equal(after, before);
});


test('GET /health returns ok', async () => {
  const response = await request(app).get('/health');
  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
});
