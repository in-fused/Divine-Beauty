require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const db = require('./db');

const app = express();
const PORT = Number(process.env.PORT || 8080);

const uploadsDir = path.join(__dirname, '..', 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const safe = `${Date.now()}-${file.originalname.replace(/\s+/g, '-').toLowerCase()}`;
    cb(null, safe);
  }
});

const upload = multer({ storage });

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'replace-with-long-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 1000 * 60 * 60 * 12 }
  })
);

app.use((req, res, next) => {
  res.locals.admin = Boolean(req.session.admin);
  next();
});

function isAdmin(req, res, next) {
  if (!req.session.admin) return res.redirect('/admin/login');
  next();
}

function ensureAdminUser() {
  const username = process.env.ADMIN_USERNAME || 'nina';
  const pass = process.env.ADMIN_PASSWORD || 'change-me-now';
  const existing = db.prepare('SELECT id FROM admin_users WHERE username = ?').get(username);
  if (!existing) {
    const hash = bcrypt.hashSync(pass, 10);
    db.prepare('INSERT INTO admin_users (username, password_hash) VALUES (?, ?)').run(username, hash);
  }
}

ensureAdminUser();

app.get('/', (_req, res) => {
  const services = db.prepare('SELECT * FROM services WHERE is_active = 1 ORDER BY id DESC').all();
  const slots = db.prepare(`
    SELECT s.*, COUNT(b.id) AS booking_count
    FROM availability_slots s
    LEFT JOIN bookings b ON b.slot_id = s.id
    WHERE datetime(s.start_at) >= datetime('now', '-2 hours')
    GROUP BY s.id
    ORDER BY datetime(s.start_at) ASC
    LIMIT 30
  `).all();
  const gallery = db.prepare('SELECT * FROM gallery_images ORDER BY datetime(created_at) DESC LIMIT 18').all();
  const posts = db.prepare('SELECT * FROM blog_posts ORDER BY datetime(created_at) DESC LIMIT 5').all();
  res.render('index', { services, slots, gallery, posts, success: null, errors: [] });
});

app.get('/api/customer-lookup', (req, res) => {
  const { phone = '', email = '' } = req.query;
  if (!phone && !email) return res.status(400).json({ error: 'phone or email required' });
  const customer = db
    .prepare('SELECT * FROM customers WHERE phone = ? OR email = ? ORDER BY datetime(updated_at) DESC LIMIT 1')
    .get(phone, email);
  if (!customer) return res.json({ found: false });
  return res.json({ found: true, customer });
});

app.post('/bookings', (req, res) => {
  const { slotId, name, phone, email, customNotes, services = [] } = req.body;
  const errors = [];
  if (!slotId) errors.push('Missing selected time block.');
  if (!name) errors.push('Name is required.');
  if (!phone && !email) errors.push('Phone or email is required.');

  const selectedServices = Array.isArray(services) ? services : [services].filter(Boolean);
  if (selectedServices.length === 0) errors.push('Please choose at least one service.');

  const slot = db.prepare('SELECT * FROM availability_slots WHERE id = ?').get(slotId);
  if (!slot) errors.push('Time block not found.');

  if (errors.length) {
    const servicesData = db.prepare('SELECT * FROM services WHERE is_active = 1 ORDER BY id DESC').all();
    const slots = db.prepare('SELECT * FROM availability_slots ORDER BY datetime(start_at) ASC LIMIT 30').all();
    const gallery = db.prepare('SELECT * FROM gallery_images ORDER BY datetime(created_at) DESC LIMIT 18').all();
    const posts = db.prepare('SELECT * FROM blog_posts ORDER BY datetime(created_at) DESC LIMIT 5').all();
    return res.status(400).render('index', { services: servicesData, slots, gallery, posts, success: null, errors });
  }

  const existingCount = db.prepare('SELECT COUNT(*) as count FROM bookings WHERE slot_id = ?').get(slotId).count;
  if (existingCount >= slot.max_bookings) {
    return res.status(400).send('This time block is full. Please choose another one.');
  }

  let customer = db
    .prepare('SELECT * FROM customers WHERE phone = ? OR email = ? ORDER BY datetime(updated_at) DESC LIMIT 1')
    .get(phone || '', email || '');

  if (!customer) {
    const customerResult = db
      .prepare('INSERT INTO customers (name, phone, email, notes) VALUES (?, ?, ?, ?)')
      .run(name, phone || null, email || null, customNotes || null);
    customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customerResult.lastInsertRowid);
  } else {
    db.prepare('UPDATE customers SET name = ?, phone = ?, email = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(
      name,
      phone || null,
      email || null,
      customNotes || customer.notes || null,
      customer.id
    );
  }

  const bookingResult = db
    .prepare('INSERT INTO bookings (slot_id, customer_id, custom_notes, status) VALUES (?, ?, ?, ?)')
    .run(slotId, customer.id, customNotes || null, 'confirmed');

  const insertBookingService = db.prepare('INSERT INTO booking_services (booking_id, service_id) VALUES (?, ?)');
  const tx = db.transaction((list) => {
    list.forEach((serviceId) => insertBookingService.run(bookingResult.lastInsertRowid, serviceId));
  });
  tx(selectedServices);

  return res.redirect('/?booked=1');
});

app.get('/admin/login', (_req, res) => res.render('admin-login', { error: null }));

app.post('/admin/login', (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM admin_users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).render('admin-login', { error: 'Invalid credentials.' });
  }
  req.session.admin = { id: user.id, username: user.username };
  return res.redirect('/admin');
});

app.post('/admin/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

app.get('/admin', isAdmin, (_req, res) => {
  const slots = db.prepare('SELECT * FROM availability_slots ORDER BY datetime(start_at) ASC').all();
  const services = db.prepare('SELECT * FROM services ORDER BY id DESC').all();
  const posts = db.prepare('SELECT * FROM blog_posts ORDER BY datetime(created_at) DESC').all();
  const bookings = db.prepare(`
    SELECT b.id, b.status, b.created_at, b.custom_notes, s.start_at, s.end_at, c.name, c.phone, c.email
    FROM bookings b
    JOIN availability_slots s ON b.slot_id = s.id
    JOIN customers c ON b.customer_id = c.id
    ORDER BY datetime(b.created_at) DESC
    LIMIT 100
  `).all();
  res.render('admin', { slots, services, posts, bookings });
});

app.post('/admin/slots', isAdmin, (req, res) => {
  const { startAt, endAt, label, maxBookings = 1 } = req.body;
  db.prepare('INSERT INTO availability_slots (start_at, end_at, label, max_bookings) VALUES (?, ?, ?, ?)').run(startAt, endAt, label, maxBookings);
  res.redirect('/admin');
});

app.post('/admin/services', isAdmin, (req, res) => {
  const { name, description, durationMinutes, priceDollars } = req.body;
  db.prepare('INSERT INTO services (name, description, duration_minutes, price_cents) VALUES (?, ?, ?, ?)').run(
    name,
    description,
    Number(durationMinutes || 60),
    Math.round(Number(priceDollars || 0) * 100)
  );
  res.redirect('/admin');
});

app.post('/admin/gallery/upload', isAdmin, upload.single('image'), (req, res) => {
  const title = req.body.title || '';
  if (req.file) {
    db.prepare('INSERT INTO gallery_images (title, image_url, source) VALUES (?, ?, ?)').run(title, `/uploads/${req.file.filename}`, 'upload');
  }
  res.redirect('/admin');
});

app.post('/admin/gallery/instagram', isAdmin, (req, res) => {
  const { title, imageUrl } = req.body;
  if (imageUrl) db.prepare('INSERT INTO gallery_images (title, image_url, source) VALUES (?, ?, ?)').run(title || '', imageUrl, 'instagram');
  res.redirect('/admin');
});

app.post('/admin/posts', isAdmin, upload.single('image'), (req, res) => {
  const { title, body } = req.body;
  const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;
  db.prepare('INSERT INTO blog_posts (title, body, image_url) VALUES (?, ?, ?)').run(title, body, imageUrl);
  res.redirect('/admin');
});

app.post('/posts/:id/comments', (req, res) => {
  const { id } = req.params;
  const { authorName, authorComment } = req.body;
  if (authorName && authorComment) {
    db.prepare('INSERT INTO comments (post_id, author_name, author_comment) VALUES (?, ?, ?)').run(id, authorName, authorComment);
  }
  res.redirect('/#blog');
});

app.get('/blog/:id', (req, res) => {
  const { id } = req.params;
  const post = db.prepare('SELECT * FROM blog_posts WHERE id = ?').get(id);
  if (!post) return res.status(404).send('Post not found');
  const comments = db.prepare('SELECT * FROM comments WHERE post_id = ? ORDER BY datetime(created_at) DESC').all(id);
  return res.render('post', { post, comments });
});

if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Divine Beauty app listening on http://0.0.0.0:${PORT}`);
  });
}

module.exports = app;
