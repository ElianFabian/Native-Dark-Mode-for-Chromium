export function normalizeRule(input) {
  const url = new URL(input.url.includes('://') ? input.url : `https://${input.url}`);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Enter an HTTP or HTTPS website without credentials.');
  }
  const path = input.scope === 'website' ? '/' : url.pathname.replace(/\/+$/, '') || '/';
  const host = url.host.toLowerCase();
  const includeSubdomains = Boolean(input.includeSubdomains);
  return {
    id: JSON.stringify([host, path, includeSubdomains]),
    host, path, includeSubdomains,
    enabled: Boolean(input.enabled),
    applyToImages: input.applyToImages !== false
  };
}

export function matchingRule(rules, address) {
  let url;
  try { url = new URL(address); } catch { return undefined; }
  if (!['http:', 'https:'].includes(url.protocol)) return undefined;
  return rules.filter(rule => {
    const host = new URL(`https://${rule.host}`);
    const hostMatches = url.host === rule.host || (
      rule.includeSubdomains && url.port === host.port && url.hostname.endsWith(`.${host.hostname}`)
    );
    return hostMatches && (rule.path === '/' || url.pathname === rule.path || url.pathname.startsWith(`${rule.path}/`));
  }).sort((a, b) => b.path.length - a.path.length || b.host.length - a.host.length || Number(a.includeSubdomains) - Number(b.includeSubdomains))[0];
}

export class RuleManager {
  constructor(api, controller) {
    this.api = api;
    this.controller = controller;
    this.mutations = Promise.resolve();
  }

  async list() {
    return (await this.api.storage.local.get('rules')).rules ?? [];
  }

  mutate(operation) {
    const result = this.mutations.catch(() => {}).then(async () => {
      const rules = operation(await this.list());
      await this.api.storage.local.set({ rules });
      return rules;
    });
    this.mutations = result;
    return result;
  }

  save(input) {
    const rule = normalizeRule(input);
    return this.mutate(rules => [...rules.filter(existing => existing.id !== rule.id), rule]);
  }

  update(id, patch) {
    return this.mutate(rules => rules.map(rule => rule.id === id ? {
      ...rule,
      ...(typeof patch.enabled === 'boolean' ? { enabled: patch.enabled } : {}),
      ...(typeof patch.applyToImages === 'boolean' ? { applyToImages: patch.applyToImages } : {})
    } : rule));
  }

  remove(id) {
    return this.mutate(rules => rules.filter(rule => rule.id !== id));
  }

  async apply(tabId, resume = false) {
    const tab = await this.api.tabs.get(tabId);
    const rule = matchingRule(await this.list(), tab.url ?? '');
    const state = await this.controller.read(tabId);
    if (state.suspended && !resume) return state;
    // Avoid attaching to tabs without an enabled matching rule.
    if (!rule?.enabled && !state.enabled) return state;
    return this.controller.set(tabId, Boolean(rule?.enabled), { applyToImages: rule?.applyToImages !== false, automatic: !resume });
  }

  async applyAll(resumeTabId) {
    const tabs = await this.api.tabs.query({});
    await Promise.allSettled(tabs.map(tab => this.apply(tab.id, tab.id === resumeTabId)));
  }
}
