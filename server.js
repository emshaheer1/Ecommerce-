// Load .env.local so local dev can use Blob (e.g. after "vercel env pull .env.local")
try {
  const dotenv = require('dotenv');
  const envPath = require('path').join(__dirname, '.env.local');
  if (require('fs').existsSync(envPath)) {
    dotenv.config({ path: envPath });
  }
} catch (_) {}

const express = require('express');
const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;

/** Admin is enabled by default when running locally (NODE_ENV !== 'production'). On a public host set NODE_ENV=production so admin is hidden; set ENABLE_ADMIN=true to turn it on there. */
const ADMIN_ENABLED = process.env.ENABLE_ADMIN === 'true' || process.env.NODE_ENV !== 'production';

const DATA_DIR = path.join(__dirname, 'data');
const PRODUCTS_FILE = path.join(DATA_DIR, 'products.json');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
const ADMINS_FILE = path.join(DATA_DIR, 'admin-users.json');

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));

const sessionSecret = process.env.SESSION_SECRET || 'felicia-store-dev-secret-change-in-production';
const isVercelEnv = process.env.VERCEL === '1';

if (isVercelEnv) {
  const cookieSession = require('cookie-session');
  app.use(
    cookieSession({
      name: 'felicia.sid',
      keys: [sessionSecret],
      maxAge: 1000 * 60 * 60 * 4,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      httpOnly: true
    })
  );
} else {
  app.use(
    session({
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
      name: 'felicia.sid',
      cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 1000 * 60 * 60 * 4
      }
    })
  );
}

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  skip: (req) => req.originalUrl === '/api/export-customers' || req.originalUrl.startsWith('/api/export-customers'),
  message: { error: 'Too many requests. Please try again later.' }
});
app.use('/api/', apiLimiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts. Try again later.' }
});
app.use('/api/admin/login', authLimiter);
app.use('/api/admin/signup', authLimiter);

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) {
      if (fallback !== undefined) {
        fs.writeFileSync(filePath, JSON.stringify(fallback, null, 2));
        return fallback;
      }
      return null;
    }
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw || 'null');
  } catch (err) {
    console.error(`Failed to read JSON from ${filePath}:`, err);
    return fallback;
  }
}

function writeJson(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error(`Failed to write JSON to ${filePath}:`, err);
  }
}

const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const USE_BLOB = !!BLOB_TOKEN;
/** Set BLOB_ACCESS=public if your Blob store was created as Public (must match store type) */
const BLOB_ACCESS = (process.env.BLOB_ACCESS || 'private').toLowerCase() === 'public' ? 'public' : 'private';

let blobPut;
let blobGet;
if (USE_BLOB) {
  try {
    const blob = require('@vercel/blob');
    blobPut = blob.put;
    blobGet = blob.get;
    console.log(`[Felicia] Using Vercel Blob (access=${BLOB_ACCESS}) for orders and admins`);
  } catch (e) {
    console.warn('[Felicia] Vercel Blob not available:', e.message);
  }
}

function blobOptions() {
  const opts = { access: BLOB_ACCESS, token: BLOB_TOKEN };
  return opts;
}

async function readBlobJson(pathname, fallback) {
  if (!blobGet) return fallback;
  try {
    const r = await blobGet(pathname, { ...blobOptions() });
    if (!r) return fallback;
    if (r.statusCode === 304 || !r.stream) return fallback;
    if (r.statusCode !== 200) return fallback;
    const chunks = [];
    for await (const chunk of r.stream) chunks.push(Buffer.from(chunk));
    const str = Buffer.concat(chunks).toString('utf8');
    if (!str) return fallback;
    return JSON.parse(str);
  } catch (e) {
    if (e && e.name !== 'BlobNotFoundError') {
      console.error(`[Felicia] Blob read failed (${pathname}):`, e.message || e);
    }
    return fallback;
  }
}

async function writeBlobJson(pathname, data) {
  if (!blobPut) return;
  try {
    await blobPut(pathname, JSON.stringify(data, null, 2), {
      ...blobOptions(),
      allowOverwrite: true,
      contentType: 'application/json'
    });
  } catch (e) {
    console.error(`[Felicia] Blob write failed (${pathname}):`, e.message || e);
    throw e;
  }
}

async function readOrders() {
  if (USE_BLOB && blobGet) return readBlobJson('felicia-orders.json', []);
  return readJson(ORDERS_FILE, []);
}

async function writeOrders(orders) {
  if (USE_BLOB && blobPut) return writeBlobJson('felicia-orders.json', orders);
  writeJson(ORDERS_FILE, orders);
}

async function readAdmins() {
  if (USE_BLOB && blobGet) return readBlobJson('felicia-admin-users.json', []);
  return readJson(ADMINS_FILE, []);
}

async function writeAdmins(admins) {
  if (USE_BLOB && blobPut) return writeBlobJson('felicia-admin-users.json', admins);
  writeJson(ADMINS_FILE, admins);
}

ensureDataDir();

if (!fs.existsSync(ORDERS_FILE)) {
  writeJson(ORDERS_FILE, []);
}

if (!fs.existsSync(ADMINS_FILE)) {
  writeJson(ADMINS_FILE, []);
}

function getMailTransporter() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  return nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user, pass }
  });
}

function buildOrderEmailHtml(order) {
  const rows = order.items
    .map(
      (i) =>
        `<tr><td>${escapeHtml(i.name)}</td><td>${i.quantity}</td><td>$${i.price.toFixed(2)}</td><td>$${i.lineTotal.toFixed(2)}</td></tr>`
    )
    .join('');
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>body{font-family:sans-serif;max-width:560px;margin:0 auto;padding:20px;color:#333;} table{width:100%;border-collapse:collapse;} th,td{padding:10px;text-align:left;border-bottom:1px solid #eee;} th{background:#0d9488;color:#fff;} .total{font-weight:700;font-size:1.1em;} h1{color:#0f766e;}</style></head>
<body>
  <h1>Felicia Store – Order Confirmation</h1>
  <p>Hi ${escapeHtml(order.customer.name)},</p>
  <p>Thanks for your order. Your order number is <strong>${escapeHtml(order.id)}</strong>.</p>
  <h2>Order details</h2>
  <table>
    <thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <p class="total">Order total: $${order.total.toFixed(2)}</p>
  <p>We'll get your order ready soon. If you have any questions, reply to this email or contact us.</p>
  <p>— Felicia Store</p>
</body>
</html>`;
}

function buildOrderEmailText(order) {
  const lines = order.items.map(
    (i) => `  ${i.name} x ${i.quantity} – $${i.lineTotal.toFixed(2)}`
  );
  return `Felicia Store – Order Confirmation

Hi ${order.customer.name},

Thanks for your order. Your order number is: ${order.id}

Order details:
${lines.join('\n')}

Order total: $${order.total.toFixed(2)}

— Felicia Store`;
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sendOrderConfirmationEmail(order) {
  const transporter = getMailTransporter();
  if (!transporter) {
    console.warn('Order confirmation email skipped: set SMTP_HOST, SMTP_USER, SMTP_PASS to enable.');
    return;
  }
  const to = order.customer?.email;
  if (!to) return;

  const from = process.env.MAIL_FROM || process.env.SMTP_USER || 'noreply@feliciastore.com';
  const subject = `Order Confirmation – ${order.id} – Felicia Store`;

  transporter.sendMail(
    {
      from,
      to,
      subject,
      text: buildOrderEmailText(order),
      html: buildOrderEmailHtml(order)
    },
    (err) => {
      if (err) console.error('Failed to send order confirmation email:', err.message);
      else console.log('Order confirmation email sent to', to);
    }
  );
}

function isLocalRequest(req) {
  const host = (req.hostname || req.headers.host || '').split(':')[0];
  return host === 'localhost' || host === '127.0.0.1';
}

function blockAdminRoute(req, res, next) {
  if (ADMIN_ENABLED || isLocalRequest(req)) return next();
  if (req.path.startsWith('/api/') || req.xhr || /application\/json/.test(req.headers.accept || '')) {
    return res.status(404).json({ error: 'Not found.' });
  }
  return res.status(404).send('Not found');
}

function requireAdminPage(req, res, next) {
  if (req.session && req.session.adminUserId) {
    return next();
  }
  return res.redirect('/admin/login');
}

function requireAdminApi(req, res, next) {
  if (req.session && req.session.adminUserId) {
    return next();
  }
  return res.status(401).json({ error: 'Not authenticated as admin.' });
}

app.get('/api/products', (req, res) => {
  const products = readJson(PRODUCTS_FILE, []);
  res.json(products);
});

app.post('/api/checkout', async (req, res) => {
  const { cartItems, customer } = req.body || {};

  if (!Array.isArray(cartItems) || cartItems.length === 0) {
    return res.status(400).json({ error: 'Cart is empty.' });
  }

  if (!customer || !customer.name || !customer.email || !customer.address) {
    return res.status(400).json({ error: 'Missing required customer information.' });
  }

  const products = readJson(PRODUCTS_FILE, []);
  const productMap = new Map(products.map((p) => [p.id, p]));

  let total = 0;
  const items = [];

  for (const item of cartItems) {
    const product = productMap.get(item.productId);
    if (!product) continue;

    const quantity = Number(item.quantity) || 1;
    const lineTotal = product.price * quantity;
    total += lineTotal;
    items.push({
      productId: product.id,
      name: product.name,
      category: product.category,
      price: product.price,
      quantity,
      size: item.size || product.size || 'Medium',
      color: item.color || product.color || '',
      lineTotal
    });
  }

  if (items.length === 0) {
    return res.status(400).json({ error: 'Cart items are invalid.' });
  }

  const orders = await readOrders();
  const orderId = `ORD-${Date.now()}`;
  const createdAt = new Date().toISOString();

  const order = {
    id: orderId,
    createdAt,
    total,
    items,
    customer: {
      name: customer.name,
      email: customer.email,
      phone: customer.phone || '',
      address: customer.address,
      city: customer.city || '',
      postalCode: customer.postalCode || '',
      country: customer.country || ''
    }
  };

  orders.push(order);
  await writeOrders(orders);

  sendOrderConfirmationEmail(order);

  res.json({
    success: true,
    orderId,
    message: 'Order placed successfully!'
  });
});

app.get('/api/orders', blockAdminRoute, requireAdminApi, async (req, res) => {
  const orders = await readOrders();
  orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(orders);
});

/** Admin-only: pull production data into local data/ (for local dashboard). Called by the "Refresh data" button. */
app.post('/api/admin/sync-from-production', blockAdminRoute, requireAdminApi, async (req, res) => {
  if (process.env.VERCEL === '1') {
    return res.status(400).json({ error: 'Sync from production is only available when running the dashboard locally.' });
  }
  const baseUrl = (process.env.PRODUCTION_URL || '').replace(/\/+$/, '');
  const secret = process.env.DASHBOARD_SYNC_SECRET;
  if (!baseUrl || !secret) {
    return res.status(400).json({
      error: 'Set PRODUCTION_URL and DASHBOARD_SYNC_SECRET in .env.local to sync from production.'
    });
  }
  try {
    const url = `${baseUrl}/api/dashboard-sync?secret=${encodeURIComponent(secret)}`;
    const response = await fetch(url);
    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({ error: text || 'Sync failed' });
    }
    const data = await response.json();
    const orders = Array.isArray(data.orders) ? data.orders : [];
    const admins = Array.isArray(data.admins) ? data.admins : [];
    await writeOrders(orders);
    await writeAdmins(admins);
    res.json({ success: true, orders: orders.length, admins: admins.length });
  } catch (e) {
    console.error('[Felicia] sync-from-production error:', e);
    res.status(500).json({ error: e.message || 'Sync failed' });
  }
});

/** Secret-protected export for syncing production data to your local dashboard. GET /api/dashboard-sync?secret=YOUR_SECRET */
app.get('/api/dashboard-sync', async (req, res) => {
  const secret = process.env.DASHBOARD_SYNC_SECRET;
  const provided = req.query.secret || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!secret || provided !== secret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const orders = await readOrders();
    const admins = await readAdmins();
    res.json({ orders: orders || [], admins: admins || [] });
  } catch (e) {
    console.error('[Felicia] dashboard-sync error:', e);
    res.status(500).json({ error: 'Sync failed' });
  }
});

app.get('/api/export-customers', blockAdminRoute, requireAdminApi, async (req, res) => {
  try {
    let raw = await readOrders();
    const orders = Array.isArray(raw) ? raw : [];
    const byEmail = new Map();
    for (const order of orders) {
      const email = order.customer?.email?.toLowerCase?.();
      if (!email) continue;
      const existing = byEmail.get(email) || {
        name: order.customer?.name || '',
        email,
        phone: order.customer?.phone || '',
        address: order.customer?.address || '',
        city: order.customer?.city || '',
        postalCode: order.customer?.postalCode || '',
        country: order.customer?.country || '',
        orders: 0,
        totalSpend: 0
      };
      existing.orders += 1;
      existing.totalSpend += order.total || 0;
      if (!existing.name && order.customer?.name) existing.name = order.customer.name;
      if (!existing.phone && order.customer?.phone) existing.phone = order.customer.phone;
      if (!existing.address && order.customer?.address) existing.address = order.customer.address;
      if (!existing.city && order.customer?.city) existing.city = order.customer.city;
      if (!existing.postalCode && order.customer?.postalCode) existing.postalCode = order.customer.postalCode;
      if (!existing.country && order.customer?.country) existing.country = order.customer.country;
      byEmail.set(email, existing);
    }
    const customers = Array.from(byEmail.values());

    const filename = `customers-${new Date().toISOString().slice(0, 10)}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    const doc = new PDFDocument({ margin: 50 });
    doc.pipe(res);

    doc.on('error', (err) => {
      console.error('PDF error:', err);
      if (!res.headersSent) res.status(500).json({ error: 'Failed to generate PDF' });
    });

    doc.fontSize(18).text('Felicia Store - Customer List', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(10).text('Exported on ' + new Date().toLocaleDateString(), { align: 'center' });
    doc.moveDown(1);

    const cols = ['Name', 'Email', 'Phone', 'Address', 'City', 'Postal', 'Country', 'Orders', 'Total'];
    const colWidths = [65, 90, 60, 85, 50, 40, 50, 35, 45];
    const startX = 50;
    const pageWidth = 512;
    let y = doc.y;

    doc.font('Helvetica-Bold').fontSize(9);
    let x = startX;
    cols.forEach(function (col, i) {
      doc.text(col, x, y, { width: colWidths[i], ellipsis: true });
      x += colWidths[i];
    });
    y += 20;
    doc.moveTo(50, y).lineTo(50 + pageWidth, y).stroke();
    y += 10;

    doc.font('Helvetica').fontSize(9);
    if (customers.length === 0) {
      doc.text('No customer data found.', startX, y);
    } else {
      for (const c of customers) {
        if (y > 720) {
          doc.addPage();
          y = 50;
        }
        x = startX;
        const safe = function (v) { return String(v == null ? '' : v).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, ''); };
        const row = [
          safe(c.name) || '-',
          safe(c.email) || '-',
          safe(c.phone) || '-',
          safe(c.address) || '-',
          safe(c.city) || '-',
          safe(c.postalCode) || '-',
          safe(c.country) || '-',
          String(c.orders),
          '$' + (c.totalSpend || 0).toFixed(2)
        ];
        row.forEach(function (val, i) {
          doc.text(val, x, y, { width: colWidths[i], ellipsis: true });
          x += colWidths[i];
        });
        y += 18;
      }
    }

    doc.end();
  } catch (err) {
    console.error('Export error:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Export failed' });
  }
});

app.post('/api/admin/signup', blockAdminRoute, async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email and password are required.' });
  }

  const admins = await readAdmins();
  const existing = admins.find((a) => a.email.toLowerCase() === email.toLowerCase());
  if (existing) {
    return res.status(409).json({ error: 'An account with this email already exists.' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const admin = {
    id: `admin-${Date.now()}`,
    name,
    email,
    passwordHash,
    createdAt: new Date().toISOString()
  };
  admins.push(admin);
  await writeAdmins(admins);

  req.session.adminUserId = admin.id;
  if (typeof req.session.save === 'function') {
    req.session.save((err) => {
      if (err) return res.status(500).json({ error: 'Session error. Please try again.' });
      res.json({ success: true });
    });
  } else {
    res.json({ success: true });
  }
});

app.post('/api/admin/login', blockAdminRoute, async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const admins = await readAdmins();
  const admin = admins.find((a) => a.email.toLowerCase() === email.toLowerCase());
  if (!admin) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  const match = await bcrypt.compare(password, admin.passwordHash);
  if (!match) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  req.session.adminUserId = admin.id;
  if (typeof req.session.save === 'function') {
    req.session.save((err) => {
      if (err) return res.status(500).json({ error: 'Session error. Please try again.' });
      res.json({ success: true });
    });
  } else {
    res.json({ success: true });
  }
});

app.post('/api/admin/logout', blockAdminRoute, (req, res) => {
  if (typeof req.session.destroy === 'function') {
    req.session.destroy(() => res.json({ success: true }));
  } else {
    req.session = null;
    res.json({ success: true });
  }
});

app.get('/admin/login', blockAdminRoute, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin-login.html'));
});

app.get('/admin/signup', blockAdminRoute, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin-signup.html'));
});

app.get('/admin', blockAdminRoute, requireAdminPage, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/contact', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'contact.html'));
});

/* Serve index at / so Vercel (which ignores express.static) still shows the homepage */
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use(express.static(path.join(__dirname, 'public')));

const isVercel = process.env.VERCEL === '1';
if (!isVercel) {
  app.listen(PORT, () => {
    console.log(`Felicia Store running at http://localhost:${PORT}`);
  });
}

module.exports = app;

