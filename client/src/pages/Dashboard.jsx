import React, { useState, useEffect } from 'react';
import {
  Page, Layout, Card, Text, Button, Badge, DataTable,
  Banner, Spinner, BlockStack, InlineStack, Box
} from '@shopify/polaris';
import { useNavigate } from 'react-router-dom';
import { api } from '../utils/api';

export default function Dashboard() {
  const navigate = useNavigate();
  const [nudges, setNudges] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [billing, setBilling] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [nudgesRes, analyticsRes, billingRes] = await Promise.all([
          api.getNudges(),
          api.getAnalytics(),
          api.getBillingStatus(),
        ]);
        setNudges(nudgesRes.nudges || []);
        setAnalytics(analyticsRes);
        setBilling(billingRes);
      } catch (err) {
        console.error('Dashboard load error:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const totalImpressions = analytics?.summary?.find(e => e.event_type === 'impression')?.count || 0;
  const totalClicks = analytics?.summary?.find(e => e.event_type === 'click')?.count || 0;
  const totalConversions = analytics?.summary?.find(e => e.event_type === 'converted')?.count || 0;
  const recoveredRevenue = analytics?.recovered_revenue || 0;
  const ctr = totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(1) : '0.0';

  if (loading) {
    return (
      <Page title="CartSaver">
        <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}>
          <Spinner size="large" />
        </div>
      </Page>
    );
  }

  return (
    <Page
      title="CartSaver Dashboard"
      subtitle="Smart abandoned cart recovery for your store"
      primaryAction={{
        content: 'Create Nudge',
        onAction: () => navigate('/nudges'),
      }}
    >
      {billing && !billing.active && (
        <Banner
          title="Start your free trial"
          status="info"
          action={{ content: 'Activate CartSaver', onAction: () => api.subscribe().then(r => r.confirmationUrl && (window.top.location.href = r.confirmationUrl)) }}
        >
          <p>CartSaver is free for 14 days, then $12.99/month. Activate now to start recovering sales.</p>
        </Banner>
      )}

      <Layout>
        {/* Stat Cards */}
        <Layout.Section>
          <InlineStack gap="400" wrap>
            <StatCard title="Impressions" value={totalImpressions.toLocaleString()} subtitle="Last 30 days" />
            <StatCard title="Clicks" value={totalClicks.toLocaleString()} subtitle={`${ctr}% CTR`} />
            <StatCard title="Conversions" value={totalConversions.toLocaleString()} subtitle="Carts recovered" />
            <StatCard title="Revenue Recovered" value={`$${recoveredRevenue.toFixed(2)}`} subtitle="Last 30 days" highlight />
          </InlineStack>
        </Layout.Section>

        {/* Nudges Table */}
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between">
                <Text variant="headingMd" as="h2">Your Nudges</Text>
                <Button onClick={() => navigate('/nudges')}>Manage Nudges</Button>
              </InlineStack>

              {nudges.length === 0 ? (
                <Box padding="600">
                  <BlockStack gap="200" align="center">
                    <Text color="subdued" alignment="center">No nudges yet.</Text>
                    <Button primary onClick={() => navigate('/nudges')}>Create your first nudge</Button>
                  </BlockStack>
                </Box>
              ) : (
                <DataTable
                  columnContentTypes={['text', 'text', 'text', 'numeric', 'numeric', 'numeric']}
                  headings={['Name', 'Type', 'Status', 'Impressions', 'Clicks', 'Conversions']}
                  rows={nudges.map(n => {
                    const stats = analytics?.per_nudge?.find(p => p.id === n.id);
                    return [
                      n.name,
                      formatType(n.type),
                      <Badge status={n.enabled ? 'success' : 'neutral'}>{n.enabled ? 'Active' : 'Paused'}</Badge>,
                      stats?.impressions || 0,
                      stats?.clicks || 0,
                      stats?.conversions || 0,
                    ];
                  })}
                />
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

function StatCard({ title, value, subtitle, highlight }) {
  return (
    <Card>
      <Box padding="400" minWidth="160px">
        <BlockStack gap="100">
          <Text variant="bodySm" color="subdued">{title}</Text>
          <Text variant="heading2xl" as="p" color={highlight ? 'success' : undefined}>{value}</Text>
          <Text variant="bodySm" color="subdued">{subtitle}</Text>
        </BlockStack>
      </Box>
    </Card>
  );
}

function formatType(type) {
  const map = {
    exit_intent: 'Exit Intent',
    shipping_shock: 'Shipping Shock',
    hesitant_browser: 'Hesitant Browser'
  };
  return map[type] || type;
}
