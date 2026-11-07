const AMAZON_DOMAINS = Object.freeze(['amazon.es', 'amazon.com', 'amazon.com.au']);

export function regionalDomainsForHost(host) {
  return AMAZON_DOMAINS.includes(host.replace(/^www\./, '')) ? AMAZON_DOMAINS : [];
}

export function ruleAddress({ host, path }) {
  // Use a scheme that preserves an explicitly stored port.
  return `${host.endsWith(':443') ? 'http' : 'https'}://${host}${path}`;
}

export function normalizeRule(input) {
  const url = new URL(input.url.includes('://') ? input.url : `https://${input.url}`);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Enter an HTTP or HTTPS website without credentials.');
  }
  const path = input.scope === 'website' ? '/' : url.pathname.replace(/\/+$/, '') || '/';
  const includeSubdomains = Boolean(input.includeSubdomains);
  // Treat a leading www as optional only when the user opts into subdomains.
  let host = includeSubdomains && url.hostname.startsWith('www.') && url.hostname.slice(4).includes('.')
    ? url.host.slice(4).toLowerCase() : url.host.toLowerCase();
  const identity = [host, path, includeSubdomains];
  if (input.includeRegionalDomains === true) {
    const domains = regionalDomainsForHost(host);
    if (!domains.length) throw new Error('Regional domains are not available for this hostname.');
    host = domains[0];
    identity[0] = host;
    identity.push(true);
  }
  return {
    id: JSON.stringify(identity),
    host, path, includeSubdomains,
    ...(input.includeRegionalDomains === true ? { includeRegionalDomains: true } : {}),
    enabled: Boolean(input.enabled)
  };
}

export function matchingRule(rules, address) {
  let url;
  try { url = new URL(address); } catch { return undefined; }
  if (!['http:', 'https:'].includes(url.protocol)) return undefined;
  return rules.filter(rule => {
    const host = new URL(ruleAddress(rule));
    const localMatch = url.host === rule.host || (
      rule.includeSubdomains && url.port === host.port && url.hostname.endsWith(`.${host.hostname}`)
    );
    const hostMatches = rule.includeRegionalDomains
      ? !url.port && regionalDomainsForHost(rule.host).some(domain => url.hostname === domain ||
          url.hostname === `www.${domain}` || (rule.includeSubdomains && url.hostname.endsWith(`.${domain}`)))
      : localMatch;
    return hostMatches && (rule.path === '/' || url.pathname === rule.path || url.pathname.startsWith(`${rule.path}/`));
  }).sort((a, b) => b.path.length - a.path.length ||
    Number(Boolean(a.includeRegionalDomains)) - Number(Boolean(b.includeRegionalDomains)) ||
    b.host.length - a.host.length || Number(a.includeSubdomains) - Number(b.includeSubdomains))[0];
}

export class RuleManager {
  constructor(api, controller) {
    this.api = api;
    this.controller = controller;
    this.mutations = Promise.resolve();
  }

  async list() {
    const rules = (await this.api.storage.local.get('rules')).rules ?? [];
    // Upgrade legacy www aliases and discard obsolete image fields. If an
    // explicit parent rule already exists, keep it over the old www alias.
    const normalized = new Map();
    for (const stored of rules) {
      const rule = normalizeRule({ url: ruleAddress(stored),
        scope: 'section', enabled: stored.enabled, includeSubdomains: stored.includeSubdomains,
        includeRegionalDomains: stored.includeRegionalDomains });
      const alias = stored.host !== rule.host;
      if (!normalized.has(rule.id) || (!alias && normalized.get(rule.id).alias)) {
        normalized.set(rule.id, { rule, alias });
      }
    }
    return [...normalized.values()].map(entry => entry.rule);
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
      ...(typeof patch.enabled === 'boolean' ? { enabled: patch.enabled } : {})
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
    return this.controller.set(tabId, Boolean(rule?.enabled), { automatic: !resume });
  }

  async applyAll(resumeTabId) {
    const tabs = await this.api.tabs.query({});
    await Promise.allSettled(tabs.map(tab => this.apply(tab.id, tab.id === resumeTabId)));
  }

  async applyFromPopup(tabId) {
    const result = await this.apply(tabId, true);
    // A background or loading tab must not hold the current popup open.
    void this.api.tabs.query({}).then(tabs => Promise.allSettled(
      tabs.filter(tab => tab.id !== tabId).map(tab => this.apply(tab.id))
    )).catch(error => console.warn('Background rule update:', error));
    return result;
  }
}
