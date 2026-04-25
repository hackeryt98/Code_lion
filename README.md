# 🦁 Lion — Telegram Mini App

A production-ready Telegram Mini App with dark theme, tap-to-earn game, leaderboard, referral system, and task rewards.

---

## File Structure

```
lion-app.html     ← Complete frontend (single file, works standalone or with backend)
server.js         ← Node.js backend (Express)
package.json      ← Dependencies
```

---

## Quick Start (Frontend Only)

The `lion-app.html` works completely standalone using `localStorage` for persistence.

1. Upload `lion-app.html` to any static host (Netlify, Vercel, GitHub Pages)
2. Set it as your Telegram Bot's Web App URL in BotFather:
   ```
   /setmenubutton → Your Bot → Set your hosted URL
   ```
3. Open via Telegram — done!

---

## With Node.js Backend

### 1. Install dependencies
```bash
npm install
```

### 2. Set environment variables
```bash
export BOT_TOKEN=your_telegram_bot_token_here
export PORT=3000
```

### 3. Put frontend in `/public`
```bash
mkdir public
cp lion-app.html public/index.html
```

### 4. Run the server
```bash
npm start
# or for dev:
npm run dev
```

### 5. Expose with ngrok (for local dev)
```bash
ngrok http 3000
# Copy the https URL → set in BotFather
```

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/user` | Get/create user profile |
| POST | `/api/tap` | Register tap(s) |
| POST | `/api/task/complete` | Complete a referral task |
| POST | `/api/referral` | Register a referral join |
| GET | `/api/leaderboard` | Top 20 users |
| GET | `/api/referral-link` | Get user's referral link |

**Auth**: Pass Telegram's `initData` in the `x-telegram-init-data` header.
In dev mode (no BOT_TOKEN set), auth is bypassed. Pass `x-dev-uid` header instead.

---

## Connecting Frontend to Backend

In `lion-app.html`, replace the `localStorage`-based state calls with `fetch()` calls to your backend.

Example:
```javascript
// Replace state loading with:
const res = await fetch('/api/user', {
  headers: { 'x-telegram-init-data': Telegram.WebApp.initData }
});
const user = await res.json();
```

---

## Features

- ✅ Auto-registers new users with 1,000 LION bonus
- ✅ Tap-to-earn game with energy system (regens over time)
- ✅ Referral link generation per user
- ✅ 5-tier referral task system (5 → 100 friends)
- ✅ Live leaderboard
- ✅ Friends count + rewards display
- ✅ Telegram `HapticFeedback` on tap
- ✅ Offline energy regeneration
- ✅ SPA navigation (no page reloads)
- ✅ Full dark theme

---

## Production Checklist

- [ ] Replace in-memory store (`Map`) with PostgreSQL or Redis
- [ ] Set real `BOT_TOKEN` environment variable
- [ ] Deploy to Railway, Render, or a VPS
- [ ] Set HTTPS URL in BotFather → `/newapp`
- [ ] Configure webhook for referral tracking via bot `/start` command
