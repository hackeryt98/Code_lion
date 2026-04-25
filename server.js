/**
 * Lion Telegram Mini App — Node.js Backend
 * ─────────────────────────────────────────
 * Stack: Express + in-memory store (swap for Redis/Postgres in prod)
 *
 * Run:
 *   npm install express cors crypto
 *   node server.js
 *
 * Set env vars:
 *   BOT_TOKEN=your_telegram_bot_token
 *   PORT=3000
 */

const express = require('express');
const crypto  = require('crypto');
const cors    = require('cors');
const path    = require('path');

const app     = express();
const PORT    = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN || 'YOUR_BOT_TOKEN_HERE';

// ── In-memory store (replace with DB in production) ──────────────────────────
const users = new Map();   // uid → UserRecord
const referrals = new Map(); // uid → Set<referredUid>

const INITIAL_BALANCE = 1000;
const LION_USD = 0.0003;

const TASKS = [
  { id:'ref5',   label:'Invite 5 Friends',    reward:1200,  req:5   },
  { id:'ref10',  label:'Invite 10 Friends',   reward:2200,  req:10  },
  { id:'ref25',  label:'Invite 25 Friends',   reward:4000,  req:25  },
  { id:'ref50',  label:'Invite 50 Friends',   reward:25000, req:50  },
  { id:'ref100', label:'Invite 100 Friends',  reward:60000, req:100 },
];

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'))); // serve frontend

// ── Telegram initData verification ───────────────────────────────────────────
function verifyTelegramData(initData) {
  if (!initData || BOT_TOKEN === 'YOUR_BOT_TOKEN_HERE') return true; // skip in dev

  const params = new URLSearchParams(initData);
  const hash   = params.get('hash');
  params.delete('hash');

  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const computedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  return computedHash === hash;
}

function parseUser(initData) {
  try {
    const params = new URLSearchParams(initData);
    return JSON.parse(params.get('user') || '{}');
  } catch { return {}; }
}

// ── Auth middleware ───────────────────────────────────────────────────────────
function auth(req, res, next) {
  const initData = req.headers['x-telegram-init-data'] || '';
  if (!verifyTelegramData(initData)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const tgUser = parseUser(initData);
  req.uid   = String(tgUser.id || req.headers['x-dev-uid'] || 'dev-user');
  req.tgUser = tgUser;
  next();
}

// ── User helpers ──────────────────────────────────────────────────────────────
function getOrCreateUser(uid, tgUser = {}) {
  if (!users.has(uid)) {
    users.set(uid, {
      uid,
      name: tgUser.first_name || 'Anonymous',
      username: tgUser.username || '',
      balance: INITIAL_BALANCE,
      energy: 500,
      energyMax: 500,
      tapRate: 1,
      completedTasks: [],
      createdAt: Date.now(),
      lastSeen: Date.now(),
      lastEnergySave: Date.now(),
    });
    referrals.set(uid, new Set());
    console.log(`[+] New user: ${uid} (${tgUser.first_name || 'anon'})`);
  }
  return users.get(uid);
}

function regenerateEnergy(user) {
  const now = Date.now();
  const secondsElapsed = (now - user.lastEnergySave) / 1000;
  user.energy = Math.min(user.energyMax, user.energy + Math.floor(secondsElapsed));
  user.lastEnergySave = now;
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /api/user — get or create user profile
app.get('/api/user', auth, (req, res) => {
  const user = getOrCreateUser(req.uid, req.tgUser);
  regenerateEnergy(user);
  user.lastSeen = Date.now();

  const friendCount = referrals.get(req.uid)?.size || 0;
  res.json({
    uid: user.uid,
    name: user.name,
    balance: user.balance,
    energy: user.energy,
    energyMax: user.energyMax,
    tapRate: user.tapRate,
    completedTasks: user.completedTasks,
    friends: friendCount,
    usdValue: (user.balance * LION_USD).toFixed(4),
    tasks: TASKS,
  });
});

// POST /api/tap — register tap(s)
app.post('/api/tap', auth, (req, res) => {
  const { taps = 1 } = req.body;
  const user = getOrCreateUser(req.uid, req.tgUser);
  regenerateEnergy(user);

  const safeTaps = Math.max(1, Math.min(Number(taps) || 1, user.energy));
  if (user.energy <= 0) {
    return res.json({ ok: false, error: 'No energy', energy: 0, balance: user.balance });
  }

  user.balance += safeTaps * user.tapRate;
  user.energy  -= safeTaps;
  user.lastEnergySave = Date.now();

  res.json({ ok: true, balance: user.balance, energy: user.energy, earned: safeTaps * user.tapRate });
});

// POST /api/task/complete — complete a task
app.post('/api/task/complete', auth, (req, res) => {
  const { taskId } = req.body;
  const task = TASKS.find(t => t.id === taskId);
  if (!task) return res.status(400).json({ error: 'Unknown task' });

  const user = getOrCreateUser(req.uid, req.tgUser);
  if (user.completedTasks.includes(taskId)) {
    return res.json({ ok: false, error: 'Already completed' });
  }

  const friendCount = referrals.get(req.uid)?.size || 0;
  if (friendCount < task.req) {
    return res.json({ ok: false, error: 'Not enough friends', need: task.req, have: friendCount });
  }

  user.balance += task.reward;
  user.completedTasks.push(taskId);

  res.json({ ok: true, balance: user.balance, reward: task.reward });
});

// POST /api/referral — register a referral
app.post('/api/referral', auth, (req, res) => {
  const { referrerId } = req.body;
  const uid = req.uid;

  if (!referrerId || referrerId === uid) {
    return res.json({ ok: false, error: 'Invalid referrer' });
  }

  const refSet = referrals.get(referrerId);
  if (!refSet) return res.json({ ok: false, error: 'Referrer not found' });

  if (refSet.has(uid)) {
    return res.json({ ok: false, error: 'Already referred' });
  }

  refSet.add(uid);

  // Give referred user a bonus
  const newUser = getOrCreateUser(uid, req.tgUser);
  newUser.balance += 100; // ref join bonus

  // Give referrer a bonus
  const referrer = users.get(referrerId);
  if (referrer) referrer.balance += 50;

  console.log(`[ref] ${uid} referred by ${referrerId}`);
  res.json({ ok: true, friendCount: refSet.size });
});

// GET /api/leaderboard — top 20 users
app.get('/api/leaderboard', auth, (req, res) => {
  const all = Array.from(users.values())
    .sort((a, b) => b.balance - a.balance)
    .slice(0, 20)
    .map((u, i) => ({
      rank: i + 1,
      name: u.username ? `@${u.username}` : u.name,
      balance: u.balance,
      isMe: u.uid === req.uid,
    }));

  res.json({ leaderboard: all });
});

// GET /api/referral-link — get referral link for user
app.get('/api/referral-link', auth, (req, res) => {
  const uid = req.uid;
  const link = `https://t.me/LionApp_bot?start=${uid}`;
  const friendCount = referrals.get(uid)?.size || 0;
  res.json({ link, friendCount });
});

// ── Health ─────────────────────────────────────────────────────────────────────
app.get('/health', (_, res) => res.json({ status: 'ok', users: users.size }));

// ── Catch-all → serve frontend ─────────────────────────────────────────────────
app.get('*', (_, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ── Start ──────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🦁 Lion backend running on http://localhost:${PORT}`);
  console.log(`   BOT_TOKEN: ${BOT_TOKEN === 'YOUR_BOT_TOKEN_HERE' ? '⚠️  not set (dev mode)' : '✅ set'}`);
});

module.exports = app;
