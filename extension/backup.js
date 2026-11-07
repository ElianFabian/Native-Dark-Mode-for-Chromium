import { normalizeRule, ruleAddress } from './rules.js';

export const MAX_BACKUP_BYTES = 1024 * 1024;
export const MAX_BACKUP_RULES = 1000;
const FORMAT = 'native-dark-mode-rules';

function validateRule(input, index) {
  const fail = () => { throw new Error(`Rule ${index + 1} is invalid. Expected a hostname, a canonical path and boolean settings.`); };
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      typeof input.host !== 'string' || !input.host || input.host.length > 512 ||
      /[\s/\\?#@]/.test(input.host) ||
      typeof input.path !== 'string' || !input.path.startsWith('/') || /[\\?#]/.test(input.path) ||
      typeof input.enabled !== 'boolean' || typeof input.includeSubdomains !== 'boolean' ||
      (input.createdAt !== undefined && (!Number.isSafeInteger(input.createdAt) || input.createdAt < 0)) ||
      (input.includeRegionalDomains !== undefined && typeof input.includeRegionalDomains !== 'boolean')) fail();
  let rule;
  try {
    rule = normalizeRule({ url: ruleAddress(input), scope: 'section',
      enabled: input.enabled, includeSubdomains: input.includeSubdomains,
      includeRegionalDomains: input.includeRegionalDomains });
  } catch { fail(); }
  const parsed = new URL(ruleAddress(input));
  if (parsed.host !== input.host.toLowerCase() || rule.path !== (input.path.replace(/\/+$/, '') || '/')) fail();
  return input.createdAt === undefined ? rule : { ...rule, createdAt: input.createdAt };
}

export function parseBackup(text) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > MAX_BACKUP_BYTES) {
    throw new Error('Choose a JSON backup smaller than 1 MiB.');
  }
  let document;
  try { document = JSON.parse(text.replace(/^\uFEFF/, '')); }
  catch { throw new Error('The selected file is not valid JSON.'); }
  if (!document || document.format !== FORMAT || document.version !== 1 || !Array.isArray(document.rules)) {
    throw new Error('Unsupported backup. Expected Native Dark Mode rules, format version 1.');
  }
  if (document.rules.length > MAX_BACKUP_RULES) throw new Error('A backup can contain at most 1,000 rules.');
  const rules = document.rules.map(validateRule);
  if (new Set(rules.map(rule => rule.id)).size !== rules.length) {
    throw new Error('The backup contains duplicate website or section scopes.');
  }
  return rules;
}

export function createBackup(rules) {
  const document = {
    format: FORMAT,
    version: 1,
    rules: rules.map(({ host, path, enabled, includeSubdomains, includeRegionalDomains, createdAt }) => ({
      host, path, enabled, includeSubdomains,
      ...(createdAt === undefined ? {} : { createdAt }),
      ...(includeRegionalDomains ? { includeRegionalDomains: true } : {})
    }))
  };
  // Export only documents this version can read back.
  parseBackup(JSON.stringify(document, null, 2) + '\n');
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

export async function importBackup(manager, text, conflictPolicy, confirmedRemovalIds) {
  // Validate everything before the first write. Use the manager queue so other
  // popup changes cannot be lost between reading and saving the merged list.
  const incoming = parseBackup(text);
  let summary;
  await manager.mutate(existing => {
    const result = mergeRules(existing, incoming, conflictPolicy);
    if (result.removedIds) {
      const confirmed = new Set(Array.isArray(confirmedRemovalIds) ? confirmedRemovalIds : []);
      if (result.removedIds.some(id => !confirmed.has(id))) {
        throw new Error('Saved rules changed since the import preview.');
      }
    }
    summary = result.summary;
    const existingIds = new Set(existing.map(rule => rule.id));
    const now = Date.now();
    return result.rules.map(rule => rule.createdAt === undefined && !existingIds.has(rule.id) ? { ...rule, createdAt: now } : rule);
  });
  return summary;
}
