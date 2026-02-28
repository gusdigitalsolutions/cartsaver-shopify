const BASE = import.meta.env.VITE_API_HOST || '';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export const api = {
  getNudges: () => request('/api/nudges'),
  createNudge: (data) => request('/api/nudges', { method: 'POST', body: JSON.stringify(data) }),
  updateNudge: (id, data) => request(`/api/nudges/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteNudge: (id) => request(`/api/nudges/${id}`, { method: 'DELETE' }),
  getAnalytics: (days = 30) => request(`/api/analytics?days=${days}`),
  getSettings: () => request('/api/settings'),
  updateSettings: (data) => request('/api/settings', { method: 'PUT', body: JSON.stringify(data) }),
  getBillingStatus: () => request('/api/billing/status'),
  subscribe: () => request('/api/billing/subscribe', { method: 'POST', body: '{}' }),
};
