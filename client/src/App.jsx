import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider } from '@shopify/polaris';
import { Provider as AppBridgeProvider } from '@shopify/app-bridge-react';
import '@shopify/polaris/build/esm/styles.css';

import Dashboard from './pages/Dashboard.jsx';
import NudgeEditor from './pages/NudgeEditor.jsx';
import Analytics from './pages/Analytics.jsx';
import Settings from './pages/Settings.jsx';

function getShopifyConfig() {
  const params = new URLSearchParams(window.location.search);
  return {
    apiKey: import.meta.env.VITE_SHOPIFY_API_KEY || window.__SHOPIFY_API_KEY__ || '',
    host: params.get('host') || '',
    forceRedirect: true,
  };
}

export default function App() {
  const config = getShopifyConfig();

  return (
    <AppProvider i18n={{}}>
      <AppBridgeProvider config={config}>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/nudges" element={<NudgeEditor />} />
            <Route path="/nudges/:id" element={<NudgeEditor />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AppBridgeProvider>
    </AppProvider>
  );
}
