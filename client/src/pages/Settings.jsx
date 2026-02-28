import React, { useState, useEffect } from 'react';
import {
  Page, Layout, Card, FormLayout, Checkbox, TextField,
  Button, Toast, Frame, Text, BlockStack, Banner, Divider
} from '@shopify/polaris';
import { api } from '../utils/api';

export default function Settings() {
  const [settings, setSettings] = useState(null);
  const [billing, setBilling] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [toast, setToast] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [settingsRes, billingRes] = await Promise.all([
          api.getSettings(),
          api.getBillingStatus(),
        ]);
        setSettings(settingsRes);
        setBilling(billingRes);
        setForm({
          global_enabled: settingsRes.global_enabled === 1,
          max_nudges_per_session: String(settingsRes.max_nudges_per_session || 2),
          nudge_cooldown_hours: String(settingsRes.nudge_cooldown_hours || 24),
          show_branding: settingsRes.show_branding === 1,
          custom_css: settingsRes.custom_css || '',
        });
      } catch (err) {
        console.error('Settings load error:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleChange = (field) => (value) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        ...form,
        max_nudges_per_session: parseInt(form.max_nudges_per_session) || 2,
        nudge_cooldown_hours: parseInt(form.nudge_cooldown_hours) || 24,
      };
      await api.updateSettings(payload);
      setToast({ content: 'Settings saved!' });
    } catch (err) {
      setToast({ content: 'Error saving settings', error: true });
    } finally {
      setSaving(false);
    }
  };

  const handleSubscribe = async () => {
    setSubscribing(true);
    try {
      const result = await api.subscribe();
      if (result.confirmationUrl) {
        window.top.location.href = result.confirmationUrl;
      } else if (!result.required) {
        setToast({ content: 'Subscription already active!' });
        setBilling({ ...billing, active: true });
      }
    } catch (err) {
      setToast({ content: 'Error starting subscription', error: true });
    } finally {
      setSubscribing(false);
    }
  };

  const toastMarkup = toast ? (
    <Toast content={toast.content} error={toast.error} onDismiss={() => setToast(null)} />
  ) : null;

  if (loading) {
    return (
      <Page title="Settings">
        <Text>Loading...</Text>
      </Page>
    );
  }

  return (
    <Frame>
      {toastMarkup}
      <Page
        title="Settings"
        primaryAction={{ content: 'Save Settings', onAction: handleSave, loading: saving }}
      >
        <Layout>
          {/* Billing */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd">Billing</Text>
                {billing?.active ? (
                  <Banner status="success" title="CartSaver Pro — Active">
                    <p>Your subscription is active. You have full access to all CartSaver features.</p>
                  </Banner>
                ) : (
                  <Banner status="warning" title="No active subscription">
                    <p>CartSaver is $12.99/month after your 14-day free trial. Activate to keep recovering sales.</p>
                  </Banner>
                )}
                {!billing?.active && (
                  <Button primary onClick={handleSubscribe} loading={subscribing}>
                    Start Free Trial — $12.99/mo
                  </Button>
                )}
                {billing?.appSubscriptions?.length > 0 && (
                  <BlockStack gap="200">
                    <Text variant="bodySm" color="subdued">Subscription details:</Text>
                    {billing.appSubscriptions.map((sub, i) => (
                      <Text key={i} variant="bodySm">
                        {sub.name} — {sub.status} (created {new Date(sub.createdAt).toLocaleDateString()})
                      </Text>
                    ))}
                  </BlockStack>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>

          <Divider />

          {/* Global Settings */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd">Global Settings</Text>
                <FormLayout>
                  <Checkbox
                    label="Enable CartSaver on your storefront"
                    checked={form.global_enabled}
                    onChange={handleChange('global_enabled')}
                    helpText="Master switch. When disabled, no nudges will show on your store."
                  />
                  <TextField
                    label="Max nudges per session"
                    type="number"
                    value={form.max_nudges_per_session}
                    onChange={handleChange('max_nudges_per_session')}
                    min={1}
                    max={10}
                    helpText="Maximum number of nudges to show a single visitor per session"
                    autoComplete="off"
                  />
                  <TextField
                    label="Nudge cooldown (hours)"
                    type="number"
                    value={form.nudge_cooldown_hours}
                    onChange={handleChange('nudge_cooldown_hours')}
                    min={1}
                    max={720}
                    helpText="Don't show the same nudge to a visitor again for this many hours"
                    autoComplete="off"
                  />
                  <Checkbox
                    label='Show "Powered by CartSaver" branding'
                    checked={form.show_branding}
                    onChange={handleChange('show_branding')}
                    helpText="Toggle the small CartSaver branding in the nudge overlay"
                  />
                </FormLayout>
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Custom CSS */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd">Custom CSS</Text>
                <Text color="subdued" variant="bodySm">
                  Override CartSaver's default nudge styles. Targets <code>#cartsaver-modal</code>, <code>#cartsaver-headline</code>, <code>#cartsaver-cta</code>, etc.
                </Text>
                <TextField
                  label="Custom CSS"
                  labelHidden
                  value={form.custom_css}
                  onChange={handleChange('custom_css')}
                  multiline={8}
                  placeholder={`#cartsaver-cta {\n  background: #your-brand-color;\n}`}
                  autoComplete="off"
                  monospaced
                />
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* About */}
          <Layout.Section>
            <Card>
              <BlockStack gap="200">
                <Text variant="headingMd">About CartSaver</Text>
                <Text variant="bodySm" color="subdued">Version 1.0.0 — by Gus Digital Solutions</Text>
                <Text variant="bodySm" color="subdued">Questions? Email <a href="mailto:gus@gusdigitalsolutions.com">gus@gusdigitalsolutions.com</a></Text>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    </Frame>
  );
}
