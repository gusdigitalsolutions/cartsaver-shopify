import React, { useState, useEffect } from 'react';
import {
  Page, Layout, Card, Text, Select, DataTable,
  Spinner, BlockStack, InlineStack, Box, Badge
} from '@shopify/polaris';
import { api } from '../utils/api';

export default function Analytics() {
  const [data, setData] = useState(null);
  const [days, setDays] = useState('30');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAnalytics();
  }, [days]);

  async function loadAnalytics() {
    setLoading(true);
    try {
      const result = await api.getAnalytics(parseInt(days));
      setData(result);
    } catch (err) {
      console.error('Analytics load error:', err);
    } finally {
      setLoading(false);
    }
  }

  const getCount = (type) => data?.summary?.find(e => e.event_type === type)?.count || 0;

  const impressions = getCount('impression');
  const clicks = getCount('click');
  const conversions = getCount('converted');
  const dismissed = getCount('dismissed');
  const revenue = data?.recovered_revenue || 0;
  const ctr = impressions > 0 ? ((clicks / impressions) * 100).toFixed(1) : '0.0';
  const cvr = impressions > 0 ? ((conversions / impressions) * 100).toFixed(1) : '0.0';

  return (
    <Page
      title="Analytics"
      subtitle="Track nudge performance and recovered revenue"
    >
      <Layout>
        {/* Time Range Filter */}
        <Layout.Section>
          <Box maxWidth="200px">
            <Select
              label="Time range"
              options={[
                { label: 'Last 7 days', value: '7' },
                { label: 'Last 30 days', value: '30' },
                { label: 'Last 90 days', value: '90' },
              ]}
              value={days}
              onChange={setDays}
            />
          </Box>
        </Layout.Section>

        {loading ? (
          <Layout.Section>
            <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
              <Spinner size="large" />
            </div>
          </Layout.Section>
        ) : (
          <>
            {/* Summary Stats */}
            <Layout.Section>
              <InlineStack gap="400" wrap>
                <MetricCard label="Impressions" value={impressions.toLocaleString()} />
                <MetricCard label="Clicks" value={clicks.toLocaleString()} sub={`${ctr}% CTR`} />
                <MetricCard label="Conversions" value={conversions.toLocaleString()} sub={`${cvr}% CVR`} />
                <MetricCard label="Dismissed" value={dismissed.toLocaleString()} />
                <MetricCard label="Revenue Recovered" value={`$${revenue.toFixed(2)}`} highlight />
              </InlineStack>
            </Layout.Section>

            {/* Per-Nudge Breakdown */}
            <Layout.Section>
              <Card>
                <BlockStack gap="300">
                  <Text variant="headingMd">Per-Nudge Performance</Text>
                  {data?.per_nudge?.length > 0 ? (
                    <DataTable
                      columnContentTypes={['text', 'text', 'numeric', 'numeric', 'numeric', 'numeric', 'text']}
                      headings={['Nudge', 'Type', 'Impressions', 'Clicks', 'Conversions', 'Revenue', 'CTR']}
                      rows={(data.per_nudge || []).map(n => [
                        n.name,
                        formatType(n.type),
                        n.impressions || 0,
                        n.clicks || 0,
                        n.conversions || 0,
                        `$${(n.revenue || 0).toFixed(2)}`,
                        n.impressions > 0
                          ? `${((n.clicks / n.impressions) * 100).toFixed(1)}%`
                          : '—',
                      ])}
                    />
                  ) : (
                    <Box padding="500">
                      <Text color="subdued" alignment="center">No nudge data yet. Create and enable nudges to start tracking performance.</Text>
                    </Box>
                  )}
                </BlockStack>
              </Card>
            </Layout.Section>
          </>
        )}
      </Layout>
    </Page>
  );
}

function MetricCard({ label, value, sub, highlight }) {
  return (
    <Card>
      <Box padding="400" minWidth="150px">
        <BlockStack gap="100">
          <Text variant="bodySm" color="subdued">{label}</Text>
          <Text variant="heading2xl" as="p" color={highlight ? 'success' : undefined}>{value}</Text>
          {sub && <Text variant="bodySm" color="subdued">{sub}</Text>}
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
