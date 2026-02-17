require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const { db, DEFAULT_THEME } = require('./db');

const app = express();
const PORT = Number(process.env.PORT || 8080);
const isProduction = process.env.NODE_ENV === 'production';

app.disable('x-powered-by');
app.set('trust proxy', 1);

const THEME_PRESETS = {
  'sunlit-botanical': DEFAULT_THEME,
  'airy-sage': {
    name: 'airy-sage',
    bgStart: '#f6fffb',
    bgEnd: '#e6f5ef',
    leafTint: '#5aa286',
    card: '#ffffff',
    cardAlt: '#eefbf3',
    text: '#17362b',
    muted: '#5c7d71',
    accent: '#f39bcf',
    accent2: '#8dd6b1',
    border: '#bde1d1',
    success: '#1aaf72'
  },
  'golden-hour': {
    name: 'golden-hour',
    bgStart: '#fffdf4',
    bgEnd: '#fff3d6',
    leafTint: '#86a86a',
    card: '#ffffff',
    cardAlt: '#fff9e8',
    text: '#4b3820',
    muted: '#83664b',
    accent: '#ff8ba7',
    accent2: '#ffd37b',
    border: '#f0d8a7',
    success: '#23a85d'
  },
  'lush-emerald': {
    name: 'lush-emerald',
    bgStart: '#effcf5',
    bgEnd: '#d7f6e4',
    leafTint: '#2f8f67',
    card: '#ffffff',
    cardAlt: '#e9fff3',
    text: '#0f3528',
    muted: '#3f6f5a',
    accent: '#ff6fa9',
    accent2: '#79db8d',
    border: '#98d9b4',
    success: '#16995f'
  }
};

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
app.use((req, res, next) => {
  if (req.path.includes('.env') || req.path.includes('package-lock')) return res.status(404).send('Not found');
  next();
});
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'replace-with-long-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: isProduction, sameSite: 'lax', httpOnly: true, maxAge: 1000 * 60 * 60 * 12 }
  })
);

function getTheme() {
  const row = db.prepare('SELECT setting_value FROM site_settings WHERE setting_key = ?').get('theme');
  if (!row) return DEFAULT_THEME;
  try {
    return { ...DEFAULT_THEME, ...JSON.parse(row.setting_value) };
  } catch (_error) {
    return DEFAULT_THEME;
  }
}

function saveTheme(theme) {
  db.prepare(
    `INSERT INTO site_settings (setting_key, setting_value, updated_at)
     VALUES (?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_at = CURRENT_TIMESTAMP`
  ).run('theme', JSON.stringify(theme));
}

function themeFromPrompt(prompt = '') {
  const p = prompt.toLowerCase();
  if (p.includes('gold') || p.includes('sun') || p.includes('warm')) return THEME_PRESETS['golden-hour'];
  if (p.includes('emerald') || p.includes('forest') || p.includes('lush')) return THEME_PRESETS['lush-emerald'];
  if (p.includes('sage') || p.includes('air') || p.includes('minimal')) return THEME_PRESETS['airy-sage'];
  if (p.includes('monstera') || p.includes('swiss') || p.includes('plant') || p.includes('natural')) return THEME_PRESETS['sunlit-botanical'];
  return THEME_PRESETS['sunlit-botanical'];
}


function parseInstagramPostUrl(raw = '') {
  const url = String(raw || '').trim();
  const match = url.match(/^https:\/\/(www\.)?instagram\.com\/p\/([A-Za-z0-9_-]+)\/?/);
  if (!match) return null;
  return { url: `https://www.instagram.com/p/${match[2]}/`, shortcode: match[2] };
}

function titleFromShortcode(shortcode) {
  return `Instagram Feature · ${shortcode}`;
}


function getHomeSlots() {
  return db.prepare(`
    SELECT s.*, COUNT(b.id) AS booking_count
    FROM availability_slots s
    LEFT JOIN bookings b ON b.slot_id = s.id
    WHERE datetime(s.start_at) >= datetime('now', '-2 hours')
    GROUP BY s.id
    ORDER BY datetime(s.start_at) ASC
    LIMIT 30
  `).all();
}

function getHomePayload(errors = []) {
  const services = db.prepare('SELECT * FROM services WHERE is_active = 1 ORDER BY id DESC').all();
  const slots = getHomeSlots();
  const gallery = db.prepare('SELECT * FROM gallery_images ORDER BY datetime(created_at) DESC LIMIT 18').all();
  const posts = db.prepare('SELECT * FROM blog_posts ORDER BY datetime(created_at) DESC LIMIT 5').all();
  const hasInstagramEmbeds = gallery.some((item) => item.source === 'instagram' && /instagram\.com\/p\//.test(item.image_url));
  return { services, slots, gallery, posts, success: null, errors, hasInstagramEmbeds };
}

app.use((req, res, next) => {
  res.locals.admin = Boolean(req.session.admin);
  res.locals.theme = getTheme();
  res.locals.themePresets = THEME_PRESETS;
  next();
});

function isAdmin(req, res, next) {
  if (!req.session.admin) return res.redirect('/admin/login');
  next();
}

function ensureAdminUser() {
  const username = process.env.ADMIN_USERNAME || 'nina';
  const pass = process.env.ADMIN_PASSWORD;
  if (!pass) {
    throw new Error('ADMIN_PASSWORD must be set in environment.');
  }
  const existing = db.prepare('SELECT id FROM admin_users WHERE username = ?').get(username);
  if (!existing) {
    const hash = bcrypt.hashSync(pass, 10);
    db.prepare('INSERT INTO admin_users (username, password_hash) VALUES (?, ?)').run(username, hash);
  }
}

if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 24) {
  if (isProduction) throw new Error('SESSION_SECRET must be set and at least 24 chars in production.');
}

ensureAdminUser();

app.get('/', (_req, res) => {
  res.render('index', getHomePayload([]));
});

app.get('/health', (_req, res) => {
  res.status(200).json({ ok: true, service: 'divine-beauty' });
});

app.get('/api/customer-lookup', (req, res) => {
  const { phone = '', email = '' } = req.query;
  if (!phone && !email) return res.status(400).json({ error: 'phone or email required' });

  const customer = db
    .prepare('SELECT name FROM customers WHERE phone = ? OR email = ? ORDER BY datetime(updated_at) DESC LIMIT 1')
    .get(phone, email);

  if (!customer) return res.json({ found: false });
  return res.json({ found: true, profile: { name: customer.name } });
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
    return res.status(400).render('index', getHomePayload(errors));
  }

  const existingCount = db.prepare('SELECT COUNT(*) as count FROM bookings WHERE slot_id = ?').get(slotId).count;
  if (existingCount >= slot.max_bookings) {
    return res.status(400).send('This time block is full. Please choose another one.');
  }

  const uniqueServiceIds = [...new Set(selectedServices.map((id) => Number(id)))].filter((id) => Number.isInteger(id));
  if (uniqueServiceIds.length === 0) {
    return res.status(400).render('index', getHomePayload(['Please choose at least one valid service.']));
  }

  const servicePlaceholders = uniqueServiceIds.map(() => '?').join(',');
  const validServiceCount = db
    .prepare(`SELECT COUNT(*) as count FROM services WHERE is_active = 1 AND id IN (${servicePlaceholders})`)
    .get(...uniqueServiceIds).count;
  if (validServiceCount !== uniqueServiceIds.length) {
    return res.status(400).render('index', getHomePayload(['One or more selected services are invalid.']));
  }

  const findCustomer = db.prepare('SELECT * FROM customers WHERE phone = ? OR email = ? ORDER BY datetime(updated_at) DESC LIMIT 1');
  const insertCustomer = db.prepare('INSERT INTO customers (name, phone, email, notes) VALUES (?, ?, ?, ?)');
  const updateCustomer = db.prepare('UPDATE customers SET name = ?, phone = ?, email = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
  const insertBooking = db.prepare('INSERT INTO bookings (slot_id, customer_id, custom_notes, status) VALUES (?, ?, ?, ?)');
  const insertBookingService = db.prepare('INSERT INTO booking_services (booking_id, service_id) VALUES (?, ?)');

  try {
    db.transaction(() => {
      let customer = findCustomer.get(phone || '', email || '');
      if (!customer) {
        const customerResult = insertCustomer.run(name, phone || null, email || null, customNotes || null);
        customer = { id: customerResult.lastInsertRowid, notes: customNotes || null };
      } else {
        updateCustomer.run(name, phone || null, email || null, customNotes || customer.notes || null, customer.id);
      }

      const bookingResult = insertBooking.run(slotId, customer.id, customNotes || null, 'confirmed');
      uniqueServiceIds.forEach((serviceId) => insertBookingService.run(bookingResult.lastInsertRowid, serviceId));
    })();
  } catch (_error) {
    return res.status(400).render('index', getHomePayload(['Could not complete booking. Please try again.']));
  }

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
  const instagramQueue = db.prepare("SELECT * FROM instagram_queue ORDER BY CASE WHEN status = 'queued' THEN 0 ELSE 1 END, datetime(created_at) DESC LIMIT 120").all();
  res.render('admin', { slots, services, posts, bookings, activeTheme: getTheme().name, instagramQueue });
});

app.post('/admin/theme/preset', isAdmin, (req, res) => {
  const selected = req.body.themeName;
  const theme = THEME_PRESETS[selected] || THEME_PRESETS['sunlit-botanical'];
  saveTheme(theme);
  res.redirect('/admin');
});

app.post('/admin/theme/prompt', isAdmin, (req, res) => {
  const prompt = req.body.themePrompt || '';
  const generatedTheme = themeFromPrompt(prompt);
  saveTheme(generatedTheme);
  res.redirect('/admin');
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
  const parsed = parseInstagramPostUrl(imageUrl);
  if (parsed) {
    db.prepare('INSERT OR IGNORE INTO instagram_queue (post_url, shortcode, caption_hint, status) VALUES (?, ?, ?, ?)').run(parsed.url, parsed.shortcode, title || '', 'queued');
  }
  res.redirect('/admin');
});


app.post('/admin/instagram-queue/add-bulk', isAdmin, (req, res) => {
  const lines = String(req.body.queueUrls || '')
    .split(/\r?\n|,/)
    .map((line) => line.trim())
    .filter(Boolean);

  const insert = db.prepare('INSERT OR IGNORE INTO instagram_queue (post_url, shortcode, caption_hint, status) VALUES (?, ?, ?, ?)');
  lines.forEach((line) => {
    const parsed = parseInstagramPostUrl(line);
    if (parsed) insert.run(parsed.url, parsed.shortcode, titleFromShortcode(parsed.shortcode), 'queued');
  });

  res.redirect('/admin');
});

app.post('/admin/instagram-queue/publish', isAdmin, (req, res) => {
  const selected = Array.isArray(req.body.queueIds) ? req.body.queueIds : [req.body.queueIds].filter(Boolean);
  if (selected.length === 0) return res.redirect('/admin');

  const getRow = db.prepare('SELECT * FROM instagram_queue WHERE id = ?');
  const markPublished = db.prepare('UPDATE instagram_queue SET status = ?, published_at = CURRENT_TIMESTAMP WHERE id = ?');
  const existsInGallery = db.prepare('SELECT id FROM gallery_images WHERE image_url = ? LIMIT 1');
  const insertGallery = db.prepare('INSERT INTO gallery_images (title, image_url, source) VALUES (?, ?, ?)');

  const tx = db.transaction((ids) => {
    ids.forEach((id) => {
      const row = getRow.get(id);
      if (!row) return;
      if (!existsInGallery.get(row.post_url)) {
        insertGallery.run(row.caption_hint || titleFromShortcode(row.shortcode || 'post'), row.post_url, 'instagram');
      }
      markPublished.run('published', row.id);
    });
  });

  tx(selected);
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
