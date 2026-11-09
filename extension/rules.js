import { regionalBaseForHost, regionalDomain } from './domains.js';

export const CUSTOM_PRESETS = ['soft', 'contrast'];

export function ruleAddress({ host, path }) {
  // Use a scheme that preserves an explicitly stored port.
  return `${host.endsWith(':443') ? 'http' : 'https'}://${host}${path}`;
}

export function ruleHostPattern(rule) {
  if (!rule.includeRegionalDomains) return rule.host;
  const prefix = rule.regionalSubdomain ? `${rule.regionalSubdomain}.` : '';
  return `${prefix}${rule.regionalName}.*`;
}

function canonicalHost(url) {
  return regionalDomain(url.hostname)?.subdomain === 'www' ? url.host.slice(4) : url.host;
}

export function orderRules(rules, order, locale) {
  const ordered = [...rules];
  if (order === 'newest') {
    return ordered.reverse().sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  }
  if (order === 'oldest') {
    return ordered.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
  }
  const collator = new Intl.Collator(locale);
  const direction = order === 'reverse-alphabetical' ? -1 : 1;
  const key = rule => ruleHostPattern(rule) + rule.path;
  return ordered.sort((a, b) => direction * collator.compare(key(a), key(b)));
}

export function groupRulesByDomain(ordered, allRules, order, locale) {
  const regionalNames = new Set(allRules.filter(rule => rule.includeRegionalDomains).map(rule => rule.regionalName));
  const groups = new Map();
  for (const rule of ordered) {
    const site = regionalDomain(rule.host);
    const domain = regionalNames.has(site?.name) ? `${site.name}.*` :
      site?.domain ?? rule.host.replace(/^www\./, '');
    if (!groups.has(domain)) groups.set(domain, []);
    groups.get(domain).push(rule);
  }
  if (order === 'newest' || order === 'oldest') return groups;
  const collator = new Intl.Collator(locale);
  const direction = order === 'reverse-alphabetical' ? -1 : 1;
  return [...groups].sort(([first], [second]) => direction * collator.compare(first, second));
}

export function normalizeRule(input) {
  const url = new URL(input.url.includes('://') ? input.url : `https://${input.url}`);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Enter an HTTP or HTTPS website without credentials.');
  }
  const path = input.scope === 'website' ? '/' : url.pathname.replace(/\/+$/, '') || '/';
  const exactPath = input.scope !== 'website' && input.includeSubpaths === false;
  const parent = input.includeParentDomain && regionalBaseForHost(url.hostname);
  if (parent?.subdomain) url.hostname = parent.domain;
  const includeSubdomains = Boolean(input.includeSubdomains || parent?.subdomain);
  // Preserve the existing normalization of broader www-prefixed rules.
  let host = includeSubdomains && url.hostname.startsWith('www.') && url.hostname.slice(4).includes('.')
    ? url.host.slice(4) : canonicalHost(url);
  const identity = [host, path, includeSubdomains];
  let regional;
  if (input.includeRegionalDomains === true) {
    regional = regionalBaseForHost(url.host);
    if (!regional) throw new Error('Regional domains are not available for this hostname.');
    host = regional.subdomain ? `${regional.subdomain}.${regional.domain}` : regional.domain;
    identity[0] = ruleHostPattern({ includeRegionalDomains: true, regionalName: regional.name,
      regionalSubdomain: regional.subdomain });
    identity.push(true);
  }
  if (exactPath && path === '/') identity.push('exact-path');
  return {
    id: JSON.stringify(identity),
    host, path, includeSubdomains,
    ...(exactPath ? { includeSubpaths: false } : {}),
    ...(regional ? { includeRegionalDomains: true, regionalName: regional.name } : {}),
    ...(regional?.subdomain ? { regionalSubdomain: regional.subdomain } : {}),
    enabled: Boolean(input.enabled),
    ...(CUSTOM_PRESETS.includes(input.preset) ? { preset: input.preset } : {})
  };
}

export function matchingRule(rules, address) {
  let url;
  try { url = new URL(address); } catch { return undefined; }
  if (!['http:', 'https:'].includes(url.protocol)) return undefined;
  const regional = url.port ? undefined : regionalBaseForHost(url.hostname);
  const currentHost = canonicalHost(url);
  return rules.filter(rule => {
    const host = new URL(ruleAddress(rule));
    const localMatch = currentHost === rule.host || (
      rule.includeSubdomains && url.port === host.port && url.hostname.endsWith(`.${host.hostname}`)
    );
    const prefix = rule.regionalSubdomain ?? '';
    const subdomain = regional?.subdomain;
    const hostMatches = rule.includeRegionalDomains
      ? regional && regional.name === rule.regionalName && (
        subdomain === prefix || (rule.includeSubdomains && (!prefix || subdomain.endsWith(`.${prefix}`)))
      )
      : localMatch;
    return hostMatches && (rule.includeSubpaths === false
      ? (url.pathname.replace(/\/+$/, '') || '/') === rule.path
      : rule.path === '/' || url.pathname === rule.path || url.pathname.startsWith(`${rule.path}/`));
  }).sort((a, b) => b.path.length - a.path.length ||
    Number(Boolean(a.includeRegionalDomains)) - Number(Boolean(b.includeRegionalDomains)) ||
    (a.includeRegionalDomains && b.includeRegionalDomains
      ? (b.regionalSubdomain?.length ?? 0) - (a.regionalSubdomain?.length ?? 0)
      : b.host.length - a.host.length) ||
    Number(a.includeSubdomains) - Number(b.includeSubdomains) ||
    Number(a.includeSubpaths !== false) - Number(b.includeSubpaths !== false))[0];
}

export function inheritedExclusion(rule, address) {
  if (!rule?.enabled || !matchingRule([rule], address)) return undefined;
  const url = new URL(address);
  if (canonicalHost(url) === rule.host) return undefined;
  if (!rule.includeRegionalDomains) {
    const parent = new URL(ruleAddress(rule)).hostname;
    if (!rule.includeSubdomains || !url.hostname.endsWith(`.${parent}`) || url.hostname === `www.${parent}`) return undefined;
  }
  return normalizeRule({ url: url.origin + rule.path, scope: 'section', enabled: false,
    includeSubpaths: rule.includeSubpaths });
}

function normalizeStoredRule(stored) {
  const rule = normalizeRule({ url: ruleAddress(stored), scope: 'section', enabled: stored.enabled,
    includeSubdomains: stored.includeSubdomains, includeRegionalDomains: stored.includeRegionalDomains,
    preset: stored.preset, includeSubpaths: stored.includeSubpaths });
  if (Number.isSafeInteger(stored.createdAt)) rule.createdAt = stored.createdAt;
  return rule;
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
      const rule = normalizeStoredRule(stored);
      const alias = stored.host !== rule.host;
      if (!normalized.has(rule.id) || (!alias && normalized.get(rule.id).alias)) {
        normalized.set(rule.id, { rule, alias });
      }
    }
    return [...normalized.values()].map(entry => entry.rule);
  }

  enqueueMutation(operation) {
    const result = this.mutations.catch(() => {}).then(operation);
    this.mutations = result;
    return result;
  }

  mutate(operation) {
    return this.enqueueMutation(async () => {
      const rules = operation(await this.list());
      await this.api.storage.local.set({ rules });
      return rules;
    });
  }

  save(input, replacedSectionId) {
    const rule = normalizeRule(input);
    return this.mutate(rules => {
      const section = rules.find(existing => existing.id === replacedSectionId);
      if (replacedSectionId) {
        const broader = section && (section.path !== '/' || section.includeSubpaths === false) &&
          normalizeRule({ ...section, url: ruleAddress(section), scope: 'website' });
        if (!broader || broader.id !== rule.id) {
          throw new Error('The original rule changed. Reopen the popup to edit it.');
        }
      }
      const existing = rules.find(entry => entry.id === rule.id);
      const createdAt = existing ? existing.createdAt : section?.createdAt ?? Date.now();
      const replacement = createdAt === undefined ? rule : { ...rule, createdAt };
      const remaining = rules.filter(entry => entry.id !== replacedSectionId);
      if (!existing) return [...remaining, replacement];
      return remaining.map(entry => entry.id === rule.id ? replacement : entry);
    });
  }

  async excludeInheritedHost(tabId, expectedUrl) {
    const { url } = await this.api.tabs.get(tabId);
    return this.mutate(rules => {
      const exclusion = url === expectedUrl && inheritedExclusion(matchingRule(rules, url), url);
      if (!exclusion) throw new Error('The tab no longer inherits a rule. Reopen the popup.');
      return [...rules, { ...exclusion, createdAt: Date.now() }];
    });
  }

  replaceScope(id, input) {
    const target = normalizeRule(input);
    return this.mutate(rules => {
      const current = rules.find(rule => rule.id === id);
      if (!current) throw new Error('The original rule changed. Reopen the popup to edit it.');
      if (target.id !== id && rules.some(rule => rule.id === target.id)) {
        // Narrowing to a saved scope keeps its explicit settings.
        const narrowsScope = (current.includeSubdomains && !target.includeSubdomains) ||
          (current.includeRegionalDomains && !target.includeRegionalDomains);
        if (narrowsScope && normalizeRule({
          ...input,
          includeSubdomains: current.includeSubdomains || target.includeSubdomains,
          includeRegionalDomains: current.includeRegionalDomains || target.includeRegionalDomains
        }).id === current.id) {
          return rules.filter(rule => rule.id !== id);
        }
        throw new Error('A rule already exists for this scope. Edit it from the saved list.');
      }
      return rules.map(rule => rule.id === id ? { ...target, enabled: current.enabled,
        ...(current.createdAt === undefined ? {} : { createdAt: current.createdAt }) } : rule);
    });
  }

  update(id, patch) {
    return this.mutate(rules => rules.map(rule => {
      if (rule.id !== id) return rule;
      const next = { ...rule };
      if (typeof patch.enabled === 'boolean') next.enabled = patch.enabled;
      if (CUSTOM_PRESETS.includes(patch.preset)) next.preset = patch.preset;
      else if (patch.preset === 'native') delete next.preset;
      return next;
    }));
  }

  remove(id) {
    return this.removeMany([id]);
  }

  removeMany(ids) {
    const confirmed = new Set(ids);
    return this.enqueueMutation(async () => {
      const rules = await this.list();
      const removed = rules.filter(rule => confirmed.has(rule.id));
      if (!removed.length) return;
      const trash = await this.listTrash();
      await this.api.storage.local.set({ rules: rules.filter(rule => !confirmed.has(rule.id)),
        trash: [...removed.map(rule => ({ id: crypto.randomUUID(), rule })), ...trash] });
    });
  }

  async listTrash() {
    const trash = (await this.api.storage.local.get('trash')).trash ?? [];
    return trash.map(entry => ({ ...entry, rule: normalizeStoredRule(entry.rule) }));
  }

  emptyTrash(ids) {
    const confirmed = new Set(ids);
    return this.enqueueMutation(async () => {
      const trash = await this.listTrash();
      await this.api.storage.local.set({ trash: trash.filter(entry => !confirmed.has(entry.id)) });
    });
  }

  restore(id) {
    return this.enqueueMutation(async () => {
      const trash = await this.listTrash();
      const deleted = trash.find(entry => entry.id === id);
      if (!deleted) return;
      const rules = await this.list();
      if (rules.some(rule => rule.id === deleted.rule.id)) {
        throw new Error('A rule already exists for this scope. Edit it from the saved list.');
      }
      await this.api.storage.local.set({ rules: [...rules, deleted.rule], trash: trash.filter(entry => entry.id !== id) });
    });
  }

  apply(tabId, resume = false) {
    return this.controller.reconcile(tabId, async () => {
      const tab = await this.api.tabs.get(tabId);
      return matchingRule(await this.list(), tab.url ?? '');
    }, !resume);
  }

  async applyAll() {
    const tabs = await this.api.tabs.query({});
    await Promise.allSettled(tabs.map(tab => this.apply(tab.id)));
  }

  async applyFromPopup(tabId, resume = true) {
    const result = await this.apply(tabId, resume);
    // A background or loading tab must not hold the current popup open.
    void this.api.tabs.query({}).then(tabs => Promise.allSettled(
      tabs.filter(tab => tab.id !== tabId).map(tab => this.apply(tab.id))
    )).catch(error => console.warn('Background rule update:', error));
    return result;
  }
}
