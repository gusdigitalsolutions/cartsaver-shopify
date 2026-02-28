const Database = require('better-sqlite3');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, '..', 'cartsaver.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

function initializeSchema() {
  const database = getDb();

  database.exec(`
    CREATE TABLE IF NOT EXISTS shops (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shop_domain TEXT UNIQUE NOT NULL,
      access_token TEXT,
      subscription_status TEXT DEFAULT 'trial',
      subscription_id TEXT,
      trial_ends_at DATETIME,
      installed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS nudges (
      id TEXT PRIMARY KEY,
      shop_domain TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('exit_intent', 'shipping_shock', 'hesitant_browser')),
      enabled INTEGER DEFAULT 1,
      headline TEXT,
      body_text TEXT,
      cta_text TEXT,
      coupon_enabled INTEGER DEFAULT 0,
      coupon_type TEXT DEFAULT 'percentage',
      coupon_value REAL DEFAULT 10,
      delay_seconds INTEGER DEFAULT 0,
      trigger_config TEXT DEFAULT '{}',
      display_config TEXT DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (shop_domain) REFERENCES shops(shop_domain)
    );

    CREATE TABLE IF NOT EXISTS nudge_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nudge_id TEXT NOT NULL,
      shop_domain TEXT NOT NULL,
      event_type TEXT NOT NULL CHECK(event_type IN ('impression', 'click', 'dismissed', 'converted')),
      session_id TEXT,
      cart_token TEXT,
      cart_value REAL,
      coupon_used TEXT,
      metadata TEXT DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (nudge_id) REFERENCES nudges(id)
    );

    CREATE TABLE IF NOT EXISTS generated_coupons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shop_domain TEXT NOT NULL,
      nudge_id TEXT NOT NULL,
      coupon_code TEXT NOT NULL,
      discount_id TEXT,
      used INTEGER DEFAULT 0,
      session_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME,
      FOREIGN KEY (nudge_id) REFERENCES nudges(id)
    );

    CREATE TABLE IF NOT EXISTS shop_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shop_domain TEXT UNIQUE NOT NULL,
      global_enabled INTEGER DEFAULT 1,
      max_nudges_per_session INTEGER DEFAULT 2,
      nudge_cooldown_hours INTEGER DEFAULT 24,
      show_branding INTEGER DEFAULT 1,
      custom_css TEXT DEFAULT '',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (shop_domain) REFERENCES shops(shop_domain)
    );

    CREATE INDEX IF NOT EXISTS idx_nudges_shop ON nudges(shop_domain);
    CREATE INDEX IF NOT EXISTS idx_events_nudge ON nudge_events(nudge_id);
    CREATE INDEX IF NOT EXISTS idx_events_shop ON nudge_events(shop_domain);
    CREATE INDEX IF NOT EXISTS idx_events_created ON nudge_events(created_at);
    CREATE INDEX IF NOT EXISTS idx_coupons_shop ON generated_coupons(shop_domain);
  `);

  console.log('[DB] Schema initialized');
}

// ─── Shop Operations ───────────────────────────────────────────────────────────

function upsertShop(shopDomain, accessToken) {
  const database = getDb();
  const stmt = database.prepare(`
    INSERT INTO shops (shop_domain, access_token, trial_ends_at)
    VALUES (?, ?, datetime('now', '+14 days'))
    ON CONFLICT(shop_domain) DO UPDATE SET
      access_token = excluded.access_token,
      updated_at = CURRENT_TIMESTAMP
  `);
  return stmt.run(shopDomain, accessToken);
}

function getShop(shopDomain) {
  return getDb().prepare('SELECT * FROM shops WHERE shop_domain = ?').get(shopDomain);
}

function updateShopSubscription(shopDomain, status, subscriptionId) {
  return getDb().prepare(`
    UPDATE shops SET subscription_status = ?, subscription_id = ?, updated_at = CURRENT_TIMESTAMP
    WHERE shop_domain = ?
  `).run(status, subscriptionId, shopDomain);
}

// ─── Nudge Operations ──────────────────────────────────────────────────────────

function getNudges(shopDomain) {
  return getDb().prepare('SELECT * FROM nudges WHERE shop_domain = ? ORDER BY created_at DESC').all(shopDomain);
}

function getNudge(id, shopDomain) {
  return getDb().prepare('SELECT * FROM nudges WHERE id = ? AND shop_domain = ?').get(id, shopDomain);
}

function createNudge(shopDomain, data) {
  const id = uuidv4();
  const stmt = getDb().prepare(`
    INSERT INTO nudges (id, shop_domain, name, type, enabled, headline, body_text, cta_text,
      coupon_enabled, coupon_type, coupon_value, delay_seconds, trigger_config, display_config)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    id, shopDomain, data.name, data.type,
    data.enabled !== false ? 1 : 0,
    data.headline || '',
    data.body_text || '',
    data.cta_text || 'Claim Offer',
    data.coupon_enabled ? 1 : 0,
    data.coupon_type || 'percentage',
    data.coupon_value || 10,
    data.delay_seconds || 0,
    JSON.stringify(data.trigger_config || {}),
    JSON.stringify(data.display_config || {})
  );
  return getNudge(id, shopDomain);
}

function updateNudge(id, shopDomain, data) {
  const allowed = ['name', 'enabled', 'headline', 'body_text', 'cta_text',
    'coupon_enabled', 'coupon_type', 'coupon_value', 'delay_seconds',
    'trigger_config', 'display_config'];

  const updates = [];
  const values = [];

  for (const key of allowed) {
    if (data[key] !== undefined) {
      updates.push(`${key} = ?`);
      let val = data[key];
      if (key === 'enabled' || key === 'coupon_enabled') val = val ? 1 : 0;
      if (key === 'trigger_config' || key === 'display_config') val = JSON.stringify(val);
      values.push(val);
    }
  }

  if (updates.length === 0) return getNudge(id, shopDomain);

  updates.push('updated_at = CURRENT_TIMESTAMP');
  values.push(id, shopDomain);

  getDb().prepare(`UPDATE nudges SET ${updates.join(', ')} WHERE id = ? AND shop_domain = ?`).run(...values);
  return getNudge(id, shopDomain);
}

function deleteNudge(id, shopDomain) {
  return getDb().prepare('DELETE FROM nudges WHERE id = ? AND shop_domain = ?').run(id, shopDomain);
}

function getEnabledNudges(shopDomain) {
  return getDb().prepare('SELECT * FROM nudges WHERE shop_domain = ? AND enabled = 1').all(shopDomain);
}

// ─── Event Tracking ────────────────────────────────────────────────────────────

function recordEvent(shopDomain, nudgeId, eventType, data = {}) {
  return getDb().prepare(`
    INSERT INTO nudge_events (nudge_id, shop_domain, event_type, session_id, cart_token, cart_value, coupon_used, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    nudgeId, shopDomain, eventType,
    data.session_id || null,
    data.cart_token || null,
    data.cart_value || null,
    data.coupon_used || null,
    JSON.stringify(data.metadata || {})
  );
}

// ─── Analytics ─────────────────────────────────────────────────────────────────

function getAnalyticsSummary(shopDomain, days = 30) {
  const db = getDb();
  const since = `datetime('now', '-${parseInt(days)} days')`;

  const totalEvents = db.prepare(`
    SELECT event_type, COUNT(*) as count
    FROM nudge_events
    WHERE shop_domain = ? AND created_at >= ${since}
    GROUP BY event_type
  `).all(shopDomain);

  const recoveredRevenue = db.prepare(`
    SELECT COALESCE(SUM(cart_value), 0) as total
    FROM nudge_events
    WHERE shop_domain = ? AND event_type = 'converted' AND created_at >= ${since}
  `).get(shopDomain);

  const perNudge = db.prepare(`
    SELECT n.id, n.name, n.type,
      COUNT(CASE WHEN e.event_type = 'impression' THEN 1 END) as impressions,
      COUNT(CASE WHEN e.event_type = 'click' THEN 1 END) as clicks,
      COUNT(CASE WHEN e.event_type = 'converted' THEN 1 END) as conversions,
      COALESCE(SUM(CASE WHEN e.event_type = 'converted' THEN e.cart_value END), 0) as revenue
    FROM nudges n
    LEFT JOIN nudge_events e ON n.id = e.nudge_id AND e.created_at >= ${since}
    WHERE n.shop_domain = ?
    GROUP BY n.id
  `).all(shopDomain);

  return {
    summary: totalEvents,
    recovered_revenue: recoveredRevenue?.total || 0,
    per_nudge: perNudge
  };
}

// ─── Settings ──────────────────────────────────────────────────────────────────

function getSettings(shopDomain) {
  const settings = getDb().prepare('SELECT * FROM shop_settings WHERE shop_domain = ?').get(shopDomain);
  if (!settings) {
    getDb().prepare(`
      INSERT OR IGNORE INTO shop_settings (shop_domain) VALUES (?)
    `).run(shopDomain);
    return getDb().prepare('SELECT * FROM shop_settings WHERE shop_domain = ?').get(shopDomain);
  }
  return settings;
}

function updateSettings(shopDomain, data) {
  const allowed = ['global_enabled', 'max_nudges_per_session', 'nudge_cooldown_hours', 'show_branding', 'custom_css'];
  const updates = [];
  const values = [];

  for (const key of allowed) {
    if (data[key] !== undefined) {
      updates.push(`${key} = ?`);
      values.push(key === 'global_enabled' || key === 'show_branding' ? (data[key] ? 1 : 0) : data[key]);
    }
  }

  if (updates.length === 0) return getSettings(shopDomain);
  updates.push('updated_at = CURRENT_TIMESTAMP');
  values.push(shopDomain);
  getDb().prepare(`UPDATE shop_settings SET ${updates.join(', ')} WHERE shop_domain = ?`).run(...values);
  return getSettings(shopDomain);
}

// ─── Coupons ───────────────────────────────────────────────────────────────────

function saveCoupon(shopDomain, nudgeId, couponCode, discountId, sessionId, expiresAt) {
  return getDb().prepare(`
    INSERT INTO generated_coupons (shop_domain, nudge_id, coupon_code, discount_id, session_id, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(shopDomain, nudgeId, couponCode, discountId, sessionId, expiresAt);
}

function markCouponUsed(couponCode, shopDomain) {
  return getDb().prepare(`
    UPDATE generated_coupons SET used = 1 WHERE coupon_code = ? AND shop_domain = ?
  `).run(couponCode, shopDomain);
}

module.exports = {
  getDb,
  initializeSchema,
  upsertShop,
  getShop,
  updateShopSubscription,
  getNudges,
  getNudge,
  createNudge,
  updateNudge,
  deleteNudge,
  getEnabledNudges,
  recordEvent,
  getAnalyticsSummary,
  getSettings,
  updateSettings,
  saveCoupon,
  markCouponUsed
};

// Run migrations if called directly
if (require.main === module) {
  initializeSchema();
  console.log('[DB] Migration complete');
  process.exit(0);
}
