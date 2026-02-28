const { BillingInterval, BillingReplacementBehavior } = require('@shopify/shopify-api');

const BILLING_CONFIG = {
  [process.env.BILLING_PLAN_NAME || 'CartSaver Pro']: {
    amount: parseFloat(process.env.BILLING_AMOUNT || '12.99'),
    currencyCode: process.env.BILLING_CURRENCY_CODE || 'USD',
    interval: BillingInterval.Every30Days,
    trialDays: parseInt(process.env.BILLING_TRIAL_DAYS || '14'),
    replacementBehavior: BillingReplacementBehavior.ApplyImmediately,
  },
};

async function checkAndRequestBilling(session, shopify) {
  const hasPayment = await shopify.billing.check({
    session,
    plans: [process.env.BILLING_PLAN_NAME || 'CartSaver Pro'],
    isTest: process.env.NODE_ENV !== 'production',
  });

  if (!hasPayment.hasActivePayment) {
    const confirmationUrl = await shopify.billing.request({
      session,
      plan: process.env.BILLING_PLAN_NAME || 'CartSaver Pro',
      isTest: process.env.NODE_ENV !== 'production',
      returnUrl: `${process.env.HOST}/api/billing/callback`,
    });
    return { required: true, confirmationUrl };
  }

  return { required: false };
}

async function getBillingStatus(session, shopify) {
  try {
    const result = await shopify.billing.check({
      session,
      plans: [process.env.BILLING_PLAN_NAME || 'CartSaver Pro'],
      isTest: process.env.NODE_ENV !== 'production',
    });
    return {
      active: result.hasActivePayment,
      appSubscriptions: result.appSubscriptions || [],
    };
  } catch (err) {
    console.error('[Billing] Error checking status:', err);
    return { active: false, appSubscriptions: [] };
  }
}

module.exports = { BILLING_CONFIG, checkAndRequestBilling, getBillingStatus };
