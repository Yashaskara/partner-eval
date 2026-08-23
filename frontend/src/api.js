const BASE = '/api';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

export const api = {
  partners: {
    list: (params) => {
      const q = new URLSearchParams(params).toString();
      return request(`/partners${q ? '?' + q : ''}`);
    },
    get: (id) => request(`/partners/${id}`),
    create: (data) => request('/partners', { method: 'POST', body: data }),
    update: (id, data) => request(`/partners/${id}`, { method: 'PUT', body: data }),
    updateDomains: (id, domains) => request(`/partners/${id}/domains`, { method: 'PUT', body: { domains } }),
    delete: (id) => request(`/partners/${id}`, { method: 'DELETE' }),
    restore: (id) => request(`/partners/${id}/restore`, { method: 'POST' }),
    deletePermanent: (id) => request(`/partners/${id}/permanent`, { method: 'DELETE' }),
    addNote: (id, type, text) => request(`/partners/${id}/notes`, { method: 'POST', body: { type, text } }),
    deleteNote: (partnerId, noteId) => request(`/partners/${partnerId}/notes/${noteId}`, { method: 'DELETE' }),
  },
  selfProfile: {
    get: () => request('/self-profile'),
    updateDomain: (domain, data) => request(`/self-profile/domains/${domain}`, { method: 'PUT', body: data }),
    updateDomains: (domains) => request('/self-profile/domains', { method: 'PUT', body: { domains } }),
    reset: () => request('/self-profile/reset', { method: 'POST' }),
    restore: () => request('/self-profile/restore', { method: 'POST' }),
  },
  profileQA: {
    getQuestions: (domain) => request(`/profile-qa/questions/${domain}`),
    getProgress: () => request('/profile-qa/progress'),
    getCrossCutting: () => request('/profile-qa/cross-cutting'),
    submitAnswer: (data) => request('/profile-qa/answer', { method: 'POST', body: data }),
    summarize: (domain, profileId = 1) => request(`/profile-qa/summarize/${domain}`, { method: 'POST', body: { profileId } }),
    saveSummary: (domain, data) => request(`/profile-qa/save-summary/${domain}`, { method: 'POST', body: data }),
  },
  conversations: {
    list: () => request('/conversations'),
    create: (data) => request('/conversations', { method: 'POST', body: data }),
    getMessages: (id) => request(`/conversations/${id}/messages`),
    sendMessage: (id, content) => request(`/conversations/${id}/message`, { method: 'POST', body: { content } }),
    classify: (id) => request(`/conversations/${id}/classify`, { method: 'POST' }),
    updatePreferences: (id, domains) => request(`/conversations/${id}/update-preferences`, { method: 'POST', body: { domains } }),
    applyUpdates: (id, updates) => request(`/conversations/${id}/apply-updates`, { method: 'POST', body: { updates } }),
  },
  analysis: {
    run: (partnerId) => request(`/analysis/${partnerId}`, { method: 'POST' }),
  },
  prepQuestions: {
    list: () => request('/prep-questions'),
    generate: () => request('/prep-questions/generate', { method: 'POST' }),
    clear: () => request('/prep-questions', { method: 'DELETE' }),
  },
  settings: {
    get: () => request('/settings'),
    setProvider: (provider) => request('/settings/provider', { method: 'PUT', body: { provider } }),
  },
};
