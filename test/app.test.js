const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const request = require('supertest');

const testDb = path.join(__dirname, 'test.db');
if (fs.existsSync(testDb)) fs.unlinkSync(testDb);
process.env.DB_PATH = testDb;
process.env.ADMIN_PASSWORD = 'test-pass';

const app = require('../src/server');

test('GET / returns 200 and booking section', async () => {
  const response = await request(app).get('/');
  assert.equal(response.status, 200);
  assert.match(response.text, /Availability Calendar Blocks/);
});

test('GET /api/customer-lookup requires phone/email', async () => {
  const response = await request(app).get('/api/customer-lookup');
  assert.equal(response.status, 400);
});
