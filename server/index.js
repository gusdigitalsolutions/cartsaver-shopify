require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const compression = require('compression');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const { shopifyApp } = require('@shopify/shopify-app-express');
const { SQLiteSessionStorage } = require('@shopify/shopify-app-session-storage-sqlite');
const { ApiVersion, BillingInterval } = require('@shopify/shopify-api');
const cron = require('node-cron');

const { initializeSchema } = require('./database');
const { BILLING_CONFIG } = require('./billing');
const apiRoutes = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Database ──────────────────────────────────────────────────────────────────
initializeSchema();

// ─── Shopify App Setup ─────────────────────────────────────────────────────────
const shopify = shopifyApp({
  api: {
    apiKey: process.env.SHOPIFY_API_KEY,
    apiSecretKey: process.env.SHOPIFY_API_SECRET,
    scopes: (process.env.SHOPIFY_SCOPES || '').split(','),
    hostName: (process.env.HOST || '').replace(/https?:\/\//, ''),
    apiVersion: ApiVersion.January24,
    billing: BILLING_CONFIG,
  },
  auth: {
    path: '/api/auth',
    callbackPath: '/api/auth/callback',
  },
  webhooks: {
    path: '/api/webhooks',
  },
  sessionStorage: new SQLiteSessionStorage(
    process.env.DATABASE_PATH || path.join(__dirname, '..', 'cartsaver.db')
  ),
});

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(morgan('combined'));
app.use(compression());
app.use(cookieParser(process.env.SESSION_SECRET || 'cartsaver-secret'));

app.use(
  helmet({
    contentSecurityPolicy: false, // Shopify embedded apps need relaxed CSP
    frameguard: false,
  })
);

app.use(
  cors({
    origin: process.env.HOST,
    credentials: true,
  })
);

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
});
app.use('/api/', limiter);

// ─── Shopify Auth & Webhooks ───────────────────────────────────────────────────
app.get(shopify.config.auth.path, shopify.auth.begin());
app.get(shopify.config.auth.callbackPath, shopify.auth.callback(), async (req, res) => {
  const session = res.locals.shopify.session;

  const { upsertShop } = require('./database');
  upsertShop(session.shop, session.accessToken);

  // Inject the storefront script tag
  try {
    const client = new (require('@shopify/shopify-api').shopifyApi({
      apiKey: process.env.SHOPIFY_API_KEY,
      apiSecretKey: process.env.SHOPIFY_API_SECRET,
      scopes: (process.env.SHOPIFY_SCOPES || '').split(','),
      hostName: (process.env.HOST || '').replace(/https?:\/\//, ''),
      apiVersion: require('@shopify/shopify-api').ApiVersion.January24,
    })).clients.Rest({ session });

    await client.post({
      path: 'script_tags',
      data: {
        script_tag: {
          event: 'onload',
          src: `${process.env.HOST}/storefront/cartsaver.js`,
          display_scope: 'all',
        },
      },
    });
    console.log('[Auth] Script tag injected for', session.shop);
  } catch (e) {
    console.warn('[Auth] Script tag injection failed (may already exist):', e.message);
  }

  res.redirect(`/?shop=${session.shop}&host=${req.query.host}`);
});

app.post(shopify.config.webhooks.path, shopify.processWebhooks({
  webhookHandlers: {
    APP_UNINSTALLED: {
      deliveryMethod: require('@shopify/shopify-api').DeliveryMethod.Http,
      callbackUrl: '/api/webhooks',
      callback: async (topic, shop) => {
        console.log(`[Webhook] App uninstalled from ${shop}`);
        // Optionally clean up shop data here
      },
    },
  },
}));

// ─── API Routes ──────────────────────────────────────────────────────────────
app.use('/api', shopify.validateAuthenticatedSession(), apiRoutes(shopify));

// ─── Serve Storefront Assets ───────────────────────────────────────────────────
app.use('/storefront', express.static(path.join(__dirname, '..', 'storefront')));

// ─── Serve React Admin (production) ───────────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '..', 'client', 'dist')));
  app.get('*', shopify.ensureInstalledOnShop(), (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'client', 'dist', 'index.html'));
  });
} else {
  app.get('/', shopify.ensureInstalledOnShop(), (req, res) => {
    res.redirect(`http://localhost:5173?shop=${req.query.shop}&host=${req.query.host}`);
  });
}

// ─── Scheduled Jobs ────────────────────────────────────────────────────────────
cron.schedule('0 * * * *', () => {
  console.log('[Cron] Hourly cleanup tick');
  // Future: expire old coupons, aggregate stats, etc.
});

// ─── Start Server ──────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[CartSaver] Server running on port ${PORT}`);
  console.log(`[CartSaver] Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;
