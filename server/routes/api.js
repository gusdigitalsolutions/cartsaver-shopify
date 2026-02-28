const express = require('express');
const router = express.Router();

const db = require('../database');
const { checkAndRequestBilling, getBillingStatus } = require('../billing');

module.exports = function (shopify) {

  // ─── Nudges ─────────────────────────────────────────────────────────────────

  router.get('/nudges', async (req, res) => {
    try {
      const shop = res.locals.shopify.session.shop;
      const nudges = db.getNudges(shop);
      res.json({ nudges });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/nudges', async (req, res) => {
    try {
      const shop = res.locals.shopify.session.shop;
      const nudge = db.createNudge(shop, req.body);
      res.status(201).json({ nudge });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.put('/nudges/:id', async (req, res) => {
    try {
      const shop = res.locals.shopify.session.shop;
      const nudge = db.updateNudge(req.params.id, shop, req.body);
      if (!nudge) return res.status(404).json({ error: 'Nudge not found' });
      res.json({ nudge });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/nudges/:id', async (req, res) => {
    try {
      const shop = res.locals.shopify.session.shop;
      const result = db.deleteNudge(req.params.id, shop);
      if (result.changes === 0) return res.status(404).json({ error: 'Nudge not found' });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── Storefront Config (public, no auth) ────────────────────────────────────

  router.get('/config/:shopDomain', async (req, res) => {
    try {
      const shop = req.params.shopDomain;
      const nudges = db.getEnabledNudges(shop);
      const settings = db.getSettings(shop);
      res.json({
        enabled: settings.global_enabled === 1,
        max_per_session: settings.max_nudges_per_session,
        cooldown_hours: settings.nudge_cooldown_hours,
        show_branding: settings.show_branding === 1,
        custom_css: settings.custom_css,
        nudges: nudges.map(n => ({
          id: n.id,
          type: n.type,
          headline: n.headline,
          body_text: n.body_text,
          cta_text: n.cta_text,
          coupon_enabled: n.coupon_enabled === 1,
          coupon_type: n.coupon_type,
          coupon_value: n.coupon_value,
          delay_seconds: n.delay_seconds,
          trigger_config: JSON.parse(n.trigger_config || '{}'),
          display_config: JSON.parse(n.display_config || '{}'),
        }))
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── Events (from storefront, no auth) ──────────────────────────────────────

  router.post('/events', express.json(), async (req, res) => {
    try {
      const { shop_domain, nudge_id, event_type, session_id, cart_token, cart_value, coupon_used, metadata } = req.body;
      if (!shop_domain || !nudge_id || !event_type) {
        return res.status(400).json({ error: 'Missing required fields' });
      }
      db.recordEvent(shop_domain, nudge_id, event_type, { session_id, cart_token, cart_value, coupon_used, metadata });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── Analytics ──────────────────────────────────────────────────────────────

  router.get('/analytics', async (req, res) => {
    try {
      const shop = res.locals.shopify.session.shop;
      const days = parseInt(req.query.days || '30');
      const data = db.getAnalyticsSummary(shop, days);
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/analytics/nudge/:id', async (req, res) => {
    try {
      const shop = res.locals.shopify.session.shop;
      const events = db.getDb().prepare(`
        SELECT event_type, DATE(created_at) as date, COUNT(*) as count
        FROM nudge_events
        WHERE nudge_id = ? AND shop_domain = ?
        GROUP BY event_type, DATE(created_at)
        ORDER BY date DESC
        LIMIT 90
      `).all(req.params.id, shop);
      res.json({ events });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── Coupons ─────────────────────────────────────────────────────────────────

  router.post('/coupons/generate', async (req, res) => {
    try {
      const session = res.locals.shopify.session;
      const { nudge_id, session_id } = req.body;

      const nudge = db.getNudge(nudge_id, session.shop);
      if (!nudge) return res.status(404).json({ error: 'Nudge not found' });

      const code = `CART${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
      const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

      // Create discount via Shopify REST API
      const { shopifyApi, ApiVersion } = require('@shopify/shopify-api');
      const shopifyClient = shopifyApi({
        apiKey: process.env.SHOPIFY_API_KEY,
        apiSecretKey: process.env.SHOPIFY_API_SECRET,
        scopes: (process.env.SHOPIFY_SCOPES || '').split(','),
        hostName: (process.env.HOST || '').replace(/https?:\/\//, ''),
        apiVersion: ApiVersion.January24,
      });

      const client = new shopifyClient.clients.Rest({ session });
      const discountResponse = await client.post({
        path: 'price_rules',
        data: {
          price_rule: {
            title: code,
            target_type: 'line_item',
            target_selection: 'all',
            allocation_method: 'across',
            value_type: nudge.coupon_type === 'fixed' ? 'fixed_amount' : 'percentage',
            value: nudge.coupon_type === 'fixed' ? `-${nudge.coupon_value}` : `-${nudge.coupon_value}`,
            customer_selection: 'all',
            starts_at: new Date().toISOString(),
            ends_at: expiresAt,
            usage_limit: 1,
          }
        }
      });

      const priceRuleId = discountResponse.body.price_rule.id;
      const couponResponse = await client.post({
        path: `price_rules/${priceRuleId}/discount_codes`,
        data: { discount_code: { code } }
      });

      const discountId = couponResponse.body.discount_code.id.toString();
      db.saveCoupon(session.shop, nudge_id, code, discountId, session_id, expiresAt);

      res.json({ code, expires_at: expiresAt });
    } catch (err) {
      console.error('[Coupons] Error generating coupon:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ─── Settings ────────────────────────────────────────────────────────────────

  router.get('/settings', async (req, res) => {
    try {
      const shop = res.locals.shopify.session.shop;
      res.json(db.getSettings(shop));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.put('/settings', async (req, res) => {
    try {
      const shop = res.locals.shopify.session.shop;
      const settings = db.updateSettings(shop, req.body);
      res.json(settings);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── Billing ─────────────────────────────────────────────────────────────────

  router.get('/billing/status', async (req, res) => {
    try {
      const session = res.locals.shopify.session;
      const status = await getBillingStatus(session, shopify);
      res.json(status);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/billing/subscribe', async (req, res) => {
    try {
      const session = res.locals.shopify.session;
      const result = await checkAndRequestBilling(session, shopify);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/billing/callback', async (req, res) => {
    try {
      const session = res.locals.shopify.session;
      const { charge_id } = req.query;
      if (charge_id) {
        const { updateShopSubscription } = require('../database');
        updateShopSubscription(session.shop, 'active', charge_id);
      }
      res.redirect(`/?shop=${session.shop}&subscribed=true`);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
