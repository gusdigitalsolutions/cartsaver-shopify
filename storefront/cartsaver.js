(function () {
  'use strict';

  // ─── Configuration ─────────────────────────────────────────────────────────
  const CARTSAVER_HOST = '{{ CARTSAVER_HOST }}';
  const SHOP_DOMAIN = window.Shopify?.shop || document.location.hostname;
  const SESSION_KEY = 'cartsaver_session';
  const SEEN_KEY = 'cartsaver_seen_nudges';
  const MAX_NUDGES_PER_SESSION = 2;

  let config = null;
  let sessionData = null;
  let activeNudge = null;
  let nudgeOverlay = null;
  let initialized = false;

  // ─── Session Management ────────────────────────────────────────────────────
  function getSession() {
    if (sessionData) return sessionData;
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      sessionData = raw ? JSON.parse(raw) : {
        id: generateId(),
        nudges_shown: [],
        created_at: Date.now()
      };
    } catch (e) {
      sessionData = { id: generateId(), nudges_shown: [], created_at: Date.now() };
    }
    return sessionData;
  }

  function saveSession() {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));
    } catch (e) {}
  }

  function generateId() {
    return 'cs_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  // ─── Configuration Loading ─────────────────────────────────────────────────
  async function loadConfig() {
    try {
      const res = await fetch(`${CARTSAVER_HOST}/api/config/${encodeURIComponent(SHOP_DOMAIN)}`);
      if (!res.ok) return null;
      config = await res.json();
      return config;
    } catch (e) {
      console.warn('[CartSaver] Could not load config:', e);
      return null;
    }
  }

  // ─── Event Tracking ────────────────────────────────────────────────────────
  function trackEvent(nudgeId, eventType, extra = {}) {
    const session = getSession();
    const cartToken = window.Shopify?.checkout?.token || null;
    const cartValue = window.__cartSaverCartValue || null;

    fetch(`${CARTSAVER_HOST}/api/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shop_domain: SHOP_DOMAIN,
        nudge_id: nudgeId,
        event_type: eventType,
        session_id: session.id,
        cart_token: cartToken,
        cart_value: cartValue,
        ...extra
      }),
      keepalive: true
    }).catch(() => {});
  }

  // ─── Coupon Generation ─────────────────────────────────────────────────────
  async function generateCoupon(nudgeId) {
    const session = getSession();
    try {
      const res = await fetch(`${CARTSAVER_HOST}/api/coupons/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nudge_id: nudgeId, session_id: session.id })
      });
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      return null;
    }
  }

  // ─── DOM / Overlay ─────────────────────────────────────────────────────────
  function createOverlay(nudge, couponCode) {
    const overlay = document.createElement('div');
    overlay.id = 'cartsaver-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', nudge.headline || 'Special Offer');

    overlay.innerHTML = `
      <div id="cartsaver-backdrop"></div>
      <div id="cartsaver-modal">
        <button id="cartsaver-close" aria-label="Close">&times;</button>
        <div id="cartsaver-icon">🛒</div>
        <h2 id="cartsaver-headline">${escapeHtml(nudge.headline || 'Wait! Don\'t leave yet.')}</h2>
        <p id="cartsaver-body">${escapeHtml(nudge.body_text || 'We have a special offer just for you.')}</p>
        ${couponCode ? `
          <div id="cartsaver-coupon">
            <span id="cartsaver-coupon-label">Use code:</span>
            <span id="cartsaver-coupon-code">${escapeHtml(couponCode)}</span>
            <button id="cartsaver-copy-btn">Copy</button>
          </div>
        ` : ''}
        <button id="cartsaver-cta">${escapeHtml(nudge.cta_text || 'Claim My Offer')}</button>
        ${config?.show_branding ? '<p id="cartsaver-branding">Powered by CartSaver</p>' : ''}
      </div>
    `;

    // Inject CSS if not already present
    if (!document.getElementById('cartsaver-styles')) {
      const link = document.createElement('link');
      link.id = 'cartsaver-styles';
      link.rel = 'stylesheet';
      link.href = `${CARTSAVER_HOST}/storefront/cartsaver.css`;
      document.head.appendChild(link);
    }

    document.body.appendChild(overlay);

    // Trigger animation
    requestAnimationFrame(() => {
      requestAnimationFrame(() => overlay.classList.add('cartsaver-visible'));
    });

    // Event bindings
    overlay.querySelector('#cartsaver-backdrop').addEventListener('click', dismissNudge);
    overlay.querySelector('#cartsaver-close').addEventListener('click', dismissNudge);
    overlay.querySelector('#cartsaver-cta').addEventListener('click', () => handleCta(nudge, couponCode));

    const copyBtn = overlay.querySelector('#cartsaver-copy-btn');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        navigator.clipboard?.writeText(couponCode).then(() => {
          copyBtn.textContent = 'Copied!';
          setTimeout(() => { copyBtn.textContent = 'Copy'; }, 2000);
        });
      });
    }

    return overlay;
  }

  function dismissNudge() {
    if (!nudgeOverlay || !activeNudge) return;
    nudgeOverlay.classList.remove('cartsaver-visible');
    trackEvent(activeNudge.id, 'dismissed');
    setTimeout(() => {
      nudgeOverlay?.remove();
      nudgeOverlay = null;
      activeNudge = null;
    }, 350);
  }

  function handleCta(nudge, couponCode) {
    trackEvent(nudge.id, 'click', { coupon_used: couponCode || null });
    dismissNudge();
    // Optionally redirect to cart
    if (window.location.pathname !== '/cart') {
      window.location.href = '/cart';
    }
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  // ─── Nudge Triggering ──────────────────────────────────────────────────────
  async function triggerNudge(nudge) {
    if (nudgeOverlay) return; // One at a time
    const session = getSession();

    if (session.nudges_shown.includes(nudge.id)) return;
    if (session.nudges_shown.length >= (config?.max_per_session || MAX_NUDGES_PER_SESSION)) return;

    // Check cooldown
    const lastShown = localStorage.getItem(`cartsaver_last_${nudge.id}`);
    if (lastShown) {
      const hoursSince = (Date.now() - parseInt(lastShown)) / 3600000;
      if (hoursSince < (config?.cooldown_hours || 24)) return;
    }

    activeNudge = nudge;
    session.nudges_shown.push(nudge.id);
    saveSession();
    localStorage.setItem(`cartsaver_last_${nudge.id}`, Date.now().toString());

    let couponCode = null;
    if (nudge.coupon_enabled) {
      const couponData = await generateCoupon(nudge.id);
      couponCode = couponData?.code || null;
    }

    nudgeOverlay = createOverlay(nudge, couponCode);
    trackEvent(nudge.id, 'impression');
  }

  function getNudgeByType(type) {
    if (!config?.nudges) return null;
    return config.nudges.find(n => n.type === type) || null;
  }

  // ─── Trigger: Exit Intent ──────────────────────────────────────────────────
  function setupExitIntent() {
    const nudge = getNudgeByType('exit_intent');
    if (!nudge) return;

    let triggered = false;
    document.addEventListener('mouseleave', (e) => {
      if (triggered || e.clientY > 10) return;
      triggered = true;
      const delay = (nudge.delay_seconds || 0) * 1000;
      setTimeout(() => triggerNudge(nudge), delay);
    });
  }

  // ─── Trigger: Hesitant Browser ─────────────────────────────────────────────
  function setupHesitantBrowser() {
    const nudge = getNudgeByType('hesitant_browser');
    if (!nudge) return;

    const threshold = nudge.trigger_config?.time_seconds || 45;
    let timer = null;
    let resetTimer = null;

    function startTimer() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => triggerNudge(nudge), threshold * 1000);
    }

    function resetOnActivity() {
      if (resetTimer) clearTimeout(resetTimer);
      resetTimer = setTimeout(startTimer, 1000);
    }

    document.addEventListener('mousemove', resetOnActivity, { passive: true });
    document.addEventListener('keydown', resetOnActivity, { passive: true });
    document.addEventListener('scroll', resetOnActivity, { passive: true });
    startTimer();
  }

  // ─── Trigger: Shipping Shock ───────────────────────────────────────────────
  function setupShippingShock() {
    const nudge = getNudgeByType('shipping_shock');
    if (!nudge) return;

    // Watch for cart page + scroll pause near shipping section
    if (!window.location.pathname.includes('/cart')) return;

    let shippingDetected = false;
    let scrollTimer = null;

    function onScroll() {
      if (shippingDetected) return;
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => {
        // Look for shipping cost elements
        const shippingEl = document.querySelector(
          '.cart__shipping, [data-shipping], .shipping-calculator, .cart-shipping'
        );
        if (shippingEl) {
          const rect = shippingEl.getBoundingClientRect();
          if (rect.top >= 0 && rect.bottom <= window.innerHeight) {
            shippingDetected = true;
            const delay = (nudge.delay_seconds || 3) * 1000;
            setTimeout(() => triggerNudge(nudge), delay);
          }
        }
      }, 2000); // 2s pause after scrolling
    }

    window.addEventListener('scroll', onScroll, { passive: true });

    // Also trigger if no scrolling after 5s on cart page
    setTimeout(() => {
      if (!shippingDetected && !nudgeOverlay) {
        shippingDetected = true;
        const delay = (nudge.delay_seconds || 0) * 1000;
        setTimeout(() => triggerNudge(nudge), delay);
      }
    }, nudge.trigger_config?.fallback_seconds * 1000 || 8000);
  }

  // ─── Cart Value Tracking ───────────────────────────────────────────────────
  function trackCartValue() {
    try {
      fetch('/cart.js')
        .then(r => r.json())
        .then(cart => {
          window.__cartSaverCartValue = cart.total_price / 100;
        })
        .catch(() => {});
    } catch (e) {}
  }

  // ─── Keyboard Accessibility ────────────────────────────────────────────────
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && nudgeOverlay) dismissNudge();
  });

  // ─── Init ──────────────────────────────────────────────────────────────────
  async function init() {
    if (initialized) return;
    initialized = true;

    const cfg = await loadConfig();
    if (!cfg || !cfg.enabled) return;

    trackCartValue();
    setupExitIntent();
    setupHesitantBrowser();
    setupShippingShock();

    console.log('[CartSaver] Initialized for', SHOP_DOMAIN);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
