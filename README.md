# CartSaver — Smart Abandoned Cart Recovery for Shopify

> Recover lost sales with intelligent behavioral nudges. CartSaver detects exit intent, shipping shock, and hesitant browsing to re-engage shoppers at the perfect moment.

**By Gus Digital Solutions** | $12.99/mo after 14-day free trial

---

## Features

- **Exit Intent Detection** — Triggers a nudge when the customer moves their cursor toward closing the tab
- **Shipping Shock Recovery** — Detects when a customer pauses after seeing shipping costs and offers a coupon
- **Hesitant Browser Nudges** — Identifies customers who've been on the cart page for too long and re-engages them
- **Smart Coupon Engine** — Auto-generates unique discount codes and delivers them via overlay nudges
- **Real-time Analytics** — Track impressions, clicks, and recovered revenue per nudge
- **Shopify-native Embed** — Fully embedded admin with Polaris UI
- **Storefront Script Injection** — Lightweight JS injected via Script Tags API

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js + Express |
| Shopify Integration | `@shopify/shopify-app-express` |
| Database | SQLite via `better-sqlite3` |
| Frontend (Admin) | React + Vite + Shopify Polaris |
| Storefront Script | Vanilla JS (injected via Script Tags) |
| Billing | Shopify Billing API (recurring) |

---

## Project Structure

```
cartsaver/
├── server/
│   ├── index.js          # Express app entry point
│   ├── database.js       # SQLite schema + helpers
│   ├── billing.js        # Shopify billing integration
│   └── routes/
│       └── api.js        # All API endpoints
├── storefront/
│   ├── cartsaver.js      # Injected storefront script
│   └── cartsaver.css     # Nudge overlay styles
├── client/               # React admin dashboard
│   ├── src/
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   ├── pages/
│   │   │   ├── Dashboard.jsx
│   │   │   ├── NudgeEditor.jsx
│   │   │   ├── Analytics.jsx
│   │   │   └── Settings.jsx
│   │   └── utils/
│   │       └── api.js
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
├── package.json
├── shopify.app.toml
├── .env.example
└── .gitignore
```

---

## Getting Started

### Prerequisites

- Node.js >= 18
- A Shopify Partner account
- A development store
- [Shopify CLI](https://shopify.dev/docs/apps/tools/cli) (optional but recommended)

### 1. Clone & Install

```bash
git clone https://github.com/gusdigitalsolutions/cartsaver-shopify.git
cd cartsaver-shopify
npm run setup
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and fill in:
- `SHOPIFY_API_KEY` — from your Shopify Partner app
- `SHOPIFY_API_SECRET` — from your Shopify Partner app
- `HOST` — your ngrok or production URL
- `SESSION_SECRET` — a long random string

### 3. Initialize the Database

```bash
npm run migrate
```

### 4. Run in Development

```bash
npm run dev
```

This starts:
- `server/index.js` on port 3000 (nodemon)
- Vite dev server for the React admin on port 5173

### 5. Install on Dev Store

Visit `https://your-ngrok-url.ngrok.io/api/auth?shop=your-dev-store.myshopify.com`

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/nudges` | List all nudges |
| POST | `/api/nudges` | Create a nudge |
| PUT | `/api/nudges/:id` | Update a nudge |
| DELETE | `/api/nudges/:id` | Delete a nudge |
| GET | `/api/analytics` | Get analytics summary |
| GET | `/api/analytics/nudge/:id` | Per-nudge analytics |
| POST | `/api/events` | Record storefront event |
| POST | `/api/coupons/generate` | Generate a discount code |
| GET | `/api/settings` | Get shop settings |
| PUT | `/api/settings` | Update shop settings |
| GET | `/api/billing/status` | Check subscription status |
| POST | `/api/billing/subscribe` | Create billing subscription |
| GET | `/api/billing/callback` | Handle billing confirmation |

---

## Nudge Types

### `exit_intent`
Triggered when `mouseleave` fires toward the top of the viewport. Shows a modal overlay with a discount offer.

### `shipping_shock`  
Triggered when the customer lingers on the cart page after an estimated high shipping cost. Offers a coupon to offset the cost.

### `hesitant_browser`
Triggered after N seconds of inactivity on the cart page. Shows a gentle reminder nudge.

---

## Billing

CartSaver uses Shopify's recurring billing API:
- **Plan**: CartSaver Pro
- **Price**: $12.99/month
- **Trial**: 14 days free
- **Currency**: USD

Billing is handled in `server/billing.js` and the subscription flow is triggered from the admin dashboard.

---

## Deployment

Recommended: Deploy to [Fly.io](https://fly.io), [Railway](https://railway.app), or any Node.js host.

```bash
# Build the React client
npm run build:client

# Start the production server
npm start
```

Ensure your `HOST` env var points to your production URL and update `shopify.app.toml` accordingly.

---

## License

MIT © [Gus Digital Solutions](mailto:gus@gusdigitalsolutions.com)
