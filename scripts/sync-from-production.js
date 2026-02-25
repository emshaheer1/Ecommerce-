/**
 * Sync orders and admins from your hosted site (e.g. Vercel) to local data/ folder.
 * Run this on your machine, then start the app locally and open the dashboard to see production data.
 *
 * Setup:
 * 1. On your hosted project (Vercel): add env var DASHBOARD_SYNC_SECRET = a long random string (e.g. from https://randomkeygen.com/).
 * 2. In this project root create .env.local with:
 *    PRODUCTION_URL=https://your-app.vercel.app
 *    DASHBOARD_SYNC_SECRET=the-same-secret-as-on-vercel
 * 3. Run: node scripts/sync-from-production.js
 * 4. Run: npm start  and open http://localhost:3000/admin (log in if needed) to see the data.
 */

const fs = require('fs');
const path = require('path');

// Load .env.local if present
try {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    content.split('\n').forEach((line) => {
      const m = line.match(/^\s*([^#=]+)=(.*)$/);
      if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    });
  }
} catch (_) {}

const PRODUCTION_URL = (process.env.PRODUCTION_URL || '').replace(/\/+$/, '');
const SECRET = process.env.DASHBOARD_SYNC_SECRET;

if (!PRODUCTION_URL || !SECRET) {
  console.error('Missing env. Create .env.local in project root with:');
  console.error('  PRODUCTION_URL=https://your-app.vercel.app');
  console.error('  DASHBOARD_SYNC_SECRET=your-secret');
  process.exit(1);
}

const url = `${PRODUCTION_URL}/api/dashboard-sync?secret=${encodeURIComponent(SECRET)}`;
const dataDir = path.join(__dirname, '..', 'data');

async function run() {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error('Sync failed:', res.status, await res.text());
      process.exit(1);
    }
    const data = await res.json();
    const orders = Array.isArray(data.orders) ? data.orders : [];
    const admins = Array.isArray(data.admins) ? data.admins : [];

    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

    fs.writeFileSync(
      path.join(dataDir, 'orders.json'),
      JSON.stringify(orders, null, 2)
    );
    fs.writeFileSync(
      path.join(dataDir, 'admin-users.json'),
      JSON.stringify(admins, null, 2)
    );

    console.log('Synced:', orders.length, 'orders,', admins.length, 'admins.');
    console.log('Run "npm start" and open the dashboard to view them.');
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}

run();
