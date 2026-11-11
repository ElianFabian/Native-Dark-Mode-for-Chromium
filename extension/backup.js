import { CUSTOM_PRESETS, isSeparatorEmphasis, normalizeRule, normalizeRuleDefaults, palettePresets, ruleAddress } from './rules.js';

export const MAX_BACKUP_BYTES = 1024 * 1024;
const MAX_BACKUP_RULES = 1000;
const FORMAT = 'native-dark-mode-rules';

function validateRule(input, index, version) {
  const fail = () => { throw new Error(`Rule ${index + 1} is invalid. Expected a hostname, a canonical path and boolean settings.`); };
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      typeof input.host !== 'string' || !input.host || input.host.length > 512 ||
      /[\s/\\?#@]/.test(input.host) ||
      typeof input.path !== 'string' || !input.path.startsWith('/') || /[\\?#]/.test(input.path) ||
      typeof input.enabled !== 'boolean' || typeof input.includeSubdomains !== 'boolean' ||
      (input.preset !== undefined && (version < 2 || !CUSTOM_PRESETS.includes(input.preset))) ||
      (input.emphasizeSeparators !== undefined && (version < 2 ||
        !isSeparatorEmphasis(input.emphasizeSeparators))) ||
      (input.paletteSeparatorEmphasis !== undefined && (version < 2 || !input.paletteSeparatorEmphasis ||
        typeof input.paletteSeparatorEmphasis !== 'object' || Array.isArray(input.paletteSeparatorEmphasis) ||
        Object.entries(input.paletteSeparatorEmphasis).some(([preset, level]) =>
          !palettePresets.includes(preset) || !isSeparatorEmphasis(level)))) ||
      (input.includeSubpaths !== undefined && (version < 3 || typeof input.includeSubpaths !== 'boolean')) ||
      (input.createdAt !== undefined && (!Number.isSafeInteger(input.createdAt) || input.createdAt < 0)) ||
      (input.includeRegionalDomains !== undefined && typeof input.includeRegionalDomains !== 'boolean')) fail();
  let rule;
  try {
    rule = normalizeRule({ url: ruleAddress(input), scope: 'section',
      enabled: input.enabled, includeSubdomains: input.includeSubdomains,
      includeRegionalDomains: input.includeRegionalDomains, preset: input.preset, includeSubpaths: input.includeSubpaths,
      emphasizeSeparators: input.emphasizeSeparators, paletteSeparatorEmphasis: input.paletteSeparatorEmphasis });
  } catch { fail(); }
  const parsed = new URL(ruleAddress(input));
  if (parsed.host !== input.host.toLowerCase() || rule.path !== (input.path.replace(/\/+$/, '') || '/')) fail();
  return input.createdAt === undefined ? rule : { ...rule, createdAt: input.createdAt };
}

export function parseConfigurationBackup(text) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > MAX_BACKUP_BYTES) {
    throw new Error('Choose a JSON backup smaller than 1 MiB.');
  }
  let document;
  try { document = JSON.parse(text.replace(/^\uFEFF/, '')); }
  catch { throw new Error('The selected file is not valid JSON.'); }
  if (!document || document.format !== FORMAT || ![1, 2, 3, 4].includes(document.version) || !Array.isArray(document.rules)) {
    throw new Error('Unsupported backup. Expected Native Dark Mode rules, format version 1, 2, 3 or 4.');
  }
  if (document.rules.length > MAX_BACKUP_RULES) throw new Error('A backup can contain at most 1,000 rules.');
  const rules = new Map();
  for (const [index, input] of document.rules.entries()) {
    const rule = validateRule(input, index, document.version);
    const alias = input.host.toLowerCase() !== rule.host;
    const existing = rules.get(rule.id);
    if (existing && (existing.merged || existing.alias === alias || rule.includeSubdomains || rule.includeRegionalDomains)) {
      throw new Error('The backup contains duplicate website or section scopes.');
    }
    // Older backups could contain both exact forms. Keep the explicit base rule.
    rules.set(rule.id, { rule: existing && alias ? existing.rule : rule, alias, merged: Boolean(existing) });
  }
  const parsed = { rules: [...rules.values()].map(entry => entry.rule) };
  if (document.version === 4 && Object.hasOwn(document, 'trash')) {
    if (!Array.isArray(document.trash) || document.trash.length > MAX_BACKUP_RULES) throw new Error('Invalid backup Trash.');
    const ids = new Set();
    parsed.trash = document.trash.map((entry, index) => {
      if (!entry || typeof entry.id !== 'string' || !/^[\w-]{1,128}$/.test(entry.id) || ids.has(entry.id)) {
        throw new Error('Invalid backup Trash.');
      }
      ids.add(entry.id);
      return { id: entry.id, rule: validateRule(entry.rule, index, 4) };
    });
  }
  if (document.version === 4 && Object.hasOwn(document, 'ruleDefaults')) {
    const value = document.ruleDefaults;
    if (!value || !['website', 'section'].includes(value.scope) ||
        !['native', ...CUSTOM_PRESETS].includes(value.preset) || !isSeparatorEmphasis(value.emphasizeSeparators) ||
        !value.domains || ['website', 'section'].some(scope => {
          const domain = value.domains[scope];
          return !domain || ['subdomains', 'regional', 'parentDomain', ...(scope === 'section' ? ['subpaths'] : [])]
            .some(key => typeof domain[key] !== 'boolean');
        })) throw new Error('Invalid backup rule defaults.');
    parsed.ruleDefaults = normalizeRuleDefaults(value);
  }
  return parsed;
}

export function parseBackup(text) {
  return parseConfigurationBackup(text).rules;
}

function backupRule({ host, path, enabled, includeSubdomains, includeRegionalDomains, includeSubpaths, createdAt, preset,
  emphasizeSeparators }) {
  return { host, path, enabled, includeSubdomains,
    ...(includeSubpaths === false ? { includeSubpaths } : {}),
    ...(preset === undefined ? {} : { preset }),
    ...(emphasizeSeparators ? { emphasizeSeparators } : {}),
    ...(createdAt === undefined ? {} : { createdAt }),
    ...(includeRegionalDomains ? { includeRegionalDomains: true } : {}) };
}

export function createBackup(rules, extras) {
  const document = {
    format: FORMAT,
    version: extras ? 4 : rules.some(rule => rule.includeSubpaths === false) ? 3 :
      rules.some(rule => rule.preset !== undefined || rule.emphasizeSeparators) ? 2 : 1,
    rules: rules.map(backupRule)
  };
  if (extras) {
    document.trash = (extras.trash ?? []).map(entry => ({ id: entry.id, rule: backupRule(entry.rule) }));
    document.ruleDefaults = normalizeRuleDefaults(extras.ruleDefaults);
  }
  // Validate the actual formatted export, including its whitespace and limits.
  parseConfigurationBackup(JSON.stringify(document, null, 2) + '\n');
  return document;
}

export function previewRemovals(preview, existing = []) {
  if (Array.isArray(preview.removedRules)) return preview.removedRules;
  if (!Array.isArray(preview.removedIds)) throw new Error('Import preview is unavailable.');
  const ids = new Set(preview.removedIds);
  const removed = existing.filter(rule => ids.has(rule.id));
  if (removed.length !== ids.size) throw new Error('Saved rules changed since the import preview.');
  return removed;
}

export function mergeRules(existing, incoming, conflictPolicy = 'keep') {
  if (conflictPolicy === 'replace-all') {
    const existingIds = new Set(existing.map(rule => rule.id));
    const incomingIds = new Set(incoming.map(rule => rule.id));
    const removedIds = existing.filter(rule => !incomingIds.has(rule.id)).map(rule => rule.id);
    const updated = incoming.filter(rule => existingIds.has(rule.id)).length;
    return { rules: incoming, removedIds,
      summary: { added: incoming.length - updated, updated, skipped: 0 } };
  }
  if (!['keep', 'replace'].includes(conflictPolicy)) throw new Error('Choose how matching rules should be handled.');
  const merged = new Map(existing.map(rule => [rule.id, rule]));
  const summary = { added: 0, updated: 0, skipped: 0 };
  for (const rule of incoming) {
    if (!merged.has(rule.id)) {
      merged.set(rule.id, rule);
      summary.added++;
    } else if (conflictPolicy === 'replace') {
      const createdAt = merged.get(rule.id).createdAt ?? rule.createdAt;
      merged.set(rule.id, createdAt === undefined ? rule : { ...rule, createdAt });
      summary.updated++;
    } else summary.skipped++;
  }
  if (merged.size > MAX_BACKUP_RULES) throw new Error('The merged configuration would exceed 1,000 rules.');
  return { rules: [...merged.values()], summary };
}

export async function importBackup(manager, text, conflictPolicy, confirmedRemovalIds, selection) {
  const incoming = parseConfigurationBackup(text);
  if (selection !== undefined && (!selection || typeof selection !== 'object' || Array.isArray(selection) ||
      Object.entries(selection).some(([key, value]) =>
        !['rules', 'trash', 'ruleDefaults'].includes(key) || typeof value !== 'boolean'))) {
    throw new Error('Invalid backup section selection.');
  }
  const parts = selection ?? { rules: true };
  if (!['rules', 'trash', 'ruleDefaults'].some(key => parts[key] === true)) {
    throw new Error('Choose at least one backup section.');
  }
  if ((parts.trash && !incoming.trash) || (parts.ruleDefaults && !incoming.ruleDefaults)) {
    throw new Error('The selected backup section is unavailable.');
  }
  let summary = { added: 0, updated: 0, skipped: 0 };
  await manager.mutateConfiguration(existing => {
    const patch = {};
    if (parts.rules === true) {
      const result = mergeRules(existing.rules, incoming.rules, conflictPolicy);
      if (result.removedIds) {
        const confirmed = new Set(Array.isArray(confirmedRemovalIds) ? confirmedRemovalIds : []);
        if (result.removedIds.some(id => !confirmed.has(id))) throw new Error('Saved rules changed since the import preview.');
      }
      summary = result.summary;
      const ids = new Set(existing.rules.map(rule => rule.id));
      const now = Date.now();
      patch.rules = result.rules.map(rule => rule.createdAt === undefined && !ids.has(rule.id) ? { ...rule, createdAt: now } : rule);
    }
    if (parts.trash === true) {
      const ids = new Set(existing.trash.map(entry => entry.id));
      const added = incoming.trash.filter(entry => !ids.has(entry.id));
      patch.trash = [...added, ...existing.trash];
      if (patch.trash.length > MAX_BACKUP_RULES) throw new Error('The merged configuration would exceed 1,000 rules.');
      summary.trashAdded = added.length;
      summary.trashSkipped = incoming.trash.length - added.length;
    }
    if (parts.ruleDefaults === true) {
      patch.ruleDefaults = incoming.ruleDefaults;
      summary.defaultsImported = true;
    }
    return patch;
  });
  return summary;
}
