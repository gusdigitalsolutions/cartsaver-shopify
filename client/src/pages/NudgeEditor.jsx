import React, { useState, useEffect, useCallback } from 'react';
import {
  Page, Layout, Card, FormLayout, TextField, Select,
  Checkbox, Button, Banner, Toast, Frame, BlockStack,
  InlineStack, Text, Divider, Badge, Modal, DataTable
} from '@shopify/polaris';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../utils/api';

const NUDGE_TYPES = [
  { label: 'Exit Intent — triggers when user tries to leave', value: 'exit_intent' },
  { label: 'Shipping Shock — triggers after viewing shipping costs', value: 'shipping_shock' },
  { label: 'Hesitant Browser — triggers after time spent on cart', value: 'hesitant_browser' },
];

const DEFAULT_NUDGE = {
  name: '',
  type: 'exit_intent',
  enabled: true,
  headline: 'Wait! Don\'t leave yet.',
  body_text: 'You have items in your cart. Complete your purchase and enjoy free shipping on us.',
  cta_text: 'Complete My Order',
  coupon_enabled: false,
  coupon_type: 'percentage',
  coupon_value: 10,
  delay_seconds: 0,
  trigger_config: {},
  display_config: {},
};

export default function NudgeEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEditing = Boolean(id);

  const [nudges, setNudges] = useState([]);
  const [form, setForm] = useState(DEFAULT_NUDGE);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { nudges: list } = await api.getNudges();
      setNudges(list);

      if (id) {
        const nudge = list.find(n => n.id === id);
        if (nudge) {
          setForm({
            ...nudge,
            trigger_config: typeof nudge.trigger_config === 'string'
              ? JSON.parse(nudge.trigger_config)
              : nudge.trigger_config,
            display_config: typeof nudge.display_config === 'string'
              ? JSON.parse(nudge.display_config)
              : nudge.display_config,
          });
        }
      }
      setLoading(false);
    }
    load();
  }, [id]);

  const handleChange = useCallback((field) => (value) => {
    setForm(prev => ({ ...prev, [field]: value }));
  }, []);

  const handleSave = async () => {
    if (!form.name.trim()) {
      setToast({ content: 'Nudge name is required', error: true });
      return;
    }
    setSaving(true);
    try {
      if (isEditing) {
        await api.updateNudge(id, form);
        setToast({ content: 'Nudge updated!' });
      } else {
        const { nudge } = await api.createNudge(form);
        setToast({ content: 'Nudge created!' });
        setTimeout(() => navigate(`/nudges/${nudge.id}`), 800);
      }
    } catch (err) {
      setToast({ content: 'Error saving nudge', error: true });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.deleteNudge(id);
      navigate('/nudges');
    } catch (err) {
      setToast({ content: 'Error deleting nudge', error: true });
    } finally {
      setDeleting(false);
      setShowDeleteModal(false);
    }
  };

  const handleToggle = async (nudge) => {
    try {
      await api.updateNudge(nudge.id, { enabled: !nudge.enabled });
      setNudges(prev => prev.map(n => n.id === nudge.id ? { ...n, enabled: !n.enabled } : n));
    } catch (err) {
      setToast({ content: 'Error toggling nudge', error: true });
    }
  };

  const toastMarkup = toast ? (
    <Toast content={toast.content} error={toast.error} onDismiss={() => setToast(null)} />
  ) : null;

  return (
    <Frame>
      {toastMarkup}
      <Page
        title={isEditing ? 'Edit Nudge' : 'Create Nudge'}
        backAction={{ content: 'Back', onAction: () => navigate('/') }}
        primaryAction={{ content: 'Save', onAction: handleSave, loading: saving }}
        secondaryActions={isEditing ? [{
          content: 'Delete',
          destructive: true,
          onAction: () => setShowDeleteModal(true),
        }] : []}
      >
        <Layout>
          {/* Nudge List */}
          {!isEditing && nudges.length > 0 && (
            <Layout.Section>
              <Card>
                <BlockStack gap="300">
                  <Text variant="headingMd">Existing Nudges</Text>
                  <DataTable
                    columnContentTypes={['text', 'text', 'text', 'text']}
                    headings={['Name', 'Type', 'Status', 'Actions']}
                    rows={nudges.map(n => [
                      n.name,
                      n.type.replace(/_/g, ' '),
                      <Badge status={n.enabled ? 'success' : 'neutral'}>{n.enabled ? 'Active' : 'Paused'}</Badge>,
                      <InlineStack gap="200">
                        <Button size="slim" onClick={() => navigate(`/nudges/${n.id}`)}>Edit</Button>
                        <Button size="slim" onClick={() => handleToggle(n)}>
                          {n.enabled ? 'Pause' : 'Activate'}
                        </Button>
                      </InlineStack>
                    ])}
                  />
                </BlockStack>
              </Card>
            </Layout.Section>
          )}

          {/* Editor Form */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd">{isEditing ? 'Edit Nudge Settings' : 'New Nudge'}</Text>
                <FormLayout>
                  <TextField
                    label="Nudge Name"
                    value={form.name}
                    onChange={handleChange('name')}
                    placeholder="e.g. Exit Intent — Homepage"
                    autoComplete="off"
                  />
                  <Select
                    label="Nudge Type"
                    options={NUDGE_TYPES}
                    value={form.type}
                    onChange={handleChange('type')}
                    helpText="Choose what behavior triggers this nudge"
                  />
                  <Checkbox
                    label="Enabled"
                    checked={form.enabled}
                    onChange={handleChange('enabled')}
                    helpText="Disabled nudges won't show on the storefront"
                  />
                </FormLayout>
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Copy / Messaging */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd">Nudge Copy</Text>
                <FormLayout>
                  <TextField
                    label="Headline"
                    value={form.headline}
                    onChange={handleChange('headline')}
                    placeholder="Wait! Don't leave yet."
                    autoComplete="off"
                    maxLength={80}
                    showCharacterCount
                  />
                  <TextField
                    label="Body Text"
                    value={form.body_text}
                    onChange={handleChange('body_text')}
                    multiline={3}
                    placeholder="You have items in your cart..."
                    autoComplete="off"
                    maxLength={200}
                    showCharacterCount
                  />
                  <TextField
                    label="CTA Button Text"
                    value={form.cta_text}
                    onChange={handleChange('cta_text')}
                    placeholder="Complete My Order"
                    autoComplete="off"
                    maxLength={40}
                    showCharacterCount
                  />
                </FormLayout>
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Coupon Settings */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd">Coupon / Discount</Text>
                <FormLayout>
                  <Checkbox
                    label="Include a discount coupon in this nudge"
                    checked={form.coupon_enabled}
                    onChange={handleChange('coupon_enabled')}
                  />
                  {form.coupon_enabled && (
                    <>
                      <Select
                        label="Discount Type"
                        options={[
                          { label: 'Percentage off (e.g. 10%)', value: 'percentage' },
                          { label: 'Fixed amount off (e.g. $5)', value: 'fixed' },
                        ]}
                        value={form.coupon_type}
                        onChange={handleChange('coupon_type')}
                      />
                      <TextField
                        label={form.coupon_type === 'percentage' ? 'Discount %' : 'Discount Amount ($)'}
                        type="number"
                        value={String(form.coupon_value)}
                        onChange={v => handleChange('coupon_value')(parseFloat(v) || 0)}
                        min={1}
                        max={form.coupon_type === 'percentage' ? 100 : 9999}
                        autoComplete="off"
                      />
                    </>
                  )}
                </FormLayout>
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Timing */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd">Timing</Text>
                <FormLayout>
                  <TextField
                    label="Delay before showing nudge (seconds)"
                    type="number"
                    value={String(form.delay_seconds)}
                    onChange={v => handleChange('delay_seconds')(parseInt(v) || 0)}
                    min={0}
                    max={60}
                    helpText="How many seconds after the trigger fires before the nudge appears"
                    autoComplete="off"
                  />
                  {form.type === 'hesitant_browser' && (
                    <TextField
                      label="Time on cart page before triggering (seconds)"
                      type="number"
                      value={String(form.trigger_config?.time_seconds || 45)}
                      onChange={v => handleChange('trigger_config')({ ...form.trigger_config, time_seconds: parseInt(v) || 45 })}
                      min={10}
                      max={300}
                      helpText="Nudge fires after this many seconds of activity on the cart page"
                      autoComplete="off"
                    />
                  )}
                </FormLayout>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>

      {/* Delete Confirmation Modal */}
      <Modal
        open={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Delete this nudge?"
        primaryAction={{ content: 'Delete', destructive: true, onAction: handleDelete, loading: deleting }}
        secondaryActions={[{ content: 'Cancel', onAction: () => setShowDeleteModal(false) }]}
      >
        <Modal.Section>
          <Text>This action cannot be undone. All analytics data for this nudge will also be removed.</Text>
        </Modal.Section>
      </Modal>
    </Frame>
  );
}
