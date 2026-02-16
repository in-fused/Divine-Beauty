const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbPath = process.env.DB_PATH || path.join(dataDir, 'divine-beauty.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS services (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  duration_minutes INTEGER DEFAULT 60,
  price_cents INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS availability_slots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  label TEXT,
  max_bookings INTEGER DEFAULT 1,
  status TEXT DEFAULT 'open'
);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  notes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slot_id INTEGER NOT NULL,
  customer_id INTEGER NOT NULL,
  custom_notes TEXT,
  status TEXT DEFAULT 'confirmed',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(slot_id) REFERENCES availability_slots(id),
  FOREIGN KEY(customer_id) REFERENCES customers(id)
);

CREATE TABLE IF NOT EXISTS booking_services (
  booking_id INTEGER NOT NULL,
  service_id INTEGER NOT NULL,
  PRIMARY KEY(booking_id, service_id),
  FOREIGN KEY(booking_id) REFERENCES bookings(id),
  FOREIGN KEY(service_id) REFERENCES services(id)
);

CREATE TABLE IF NOT EXISTS gallery_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT,
  image_url TEXT NOT NULL,
  source TEXT DEFAULT 'upload',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS blog_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  image_url TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,
  author_name TEXT NOT NULL,
  author_comment TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(post_id) REFERENCES blog_posts(id)
);

CREATE TABLE IF NOT EXISTS admin_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_slot_start ON availability_slots(start_at);
CREATE INDEX IF NOT EXISTS idx_customer_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_customer_email ON customers(email);
CREATE INDEX IF NOT EXISTS idx_bookings_slot ON bookings(slot_id);
CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id);
`);

function seedIfEmpty() {
  const serviceCount = db.prepare('SELECT COUNT(*) as count FROM services').get().count;
  if (serviceCount === 0) {
    const insert = db.prepare('INSERT INTO services (name, description, duration_minutes, price_cents) VALUES (?, ?, ?, ?)');
    const seedServices = [
      ['Silk Press', 'Smooth and sleek natural styling.', 90, 9500],
      ['Color + Gloss', 'Custom color with shine enhancement.', 120, 14500],
      ['Signature Cut', 'Precision trim or shape-up.', 60, 7000],
      ['Protective Style', 'Low-manipulation style with finish.', 150, 16000]
    ];
    const tx = db.transaction((rows) => rows.forEach((r) => insert.run(...r)));
    tx(seedServices);
  }

  const slotCount = db.prepare('SELECT COUNT(*) as count FROM availability_slots').get().count;
  if (slotCount === 0) {
    const now = new Date();
    const mk = (days, hour) => {
      const d = new Date(now);
      d.setDate(d.getDate() + days);
      d.setHours(hour, 0, 0, 0);
      return d.toISOString();
    };
    const slotInsert = db.prepare('INSERT INTO availability_slots (start_at, end_at, label, max_bookings) VALUES (?, ?, ?, ?)');
    slotInsert.run(mk(1, 10), mk(1, 12), 'Tomorrow Morning Glam', 1);
    slotInsert.run(mk(1, 13), mk(1, 15), 'Tomorrow Afternoon Refresh', 1);
    slotInsert.run(mk(2, 11), mk(2, 13), 'Premium Weekend Session', 2);
  }
}

seedIfEmpty();

module.exports = db;
