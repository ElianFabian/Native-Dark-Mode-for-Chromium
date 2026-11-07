import { normalizeRule, orderRules, ruleAddress, inheritedExclusion } from './rules.js';
import { regionalBaseForHost, regionalDomain } from './domains.js';
import { requestWithTimeout } from './request.js';
import { MAX_BACKUP_BYTES } from './backup.js';
import { LANGUAGES, initializeLanguage, setLanguage, translatePage, t, errorText } from './i18n.js';
import { initializeAppearance } from './appearance.js';
import { readChoice, writeChoice } from './choices.js';

const $ = selector => document.querySelector(selector);
const isManager = document.documentElement.dataset.page === 'options';
const popupRuleLimit = 5;
let tab;
let snapshot;
let busy = false;
let pendingImport;
let displayedRule;
let editingId;
let refreshAppearance;

for (const [code, name] of Object.entries(LANGUAGES)) {
  const option = document.createElement('option');
  option.value = code;
  option.textContent = name;
  $('#language')?.append(option);
}

function draft(enabled) {
  return {
    url: $('#address').value.trim(), scope: readChoice($('#scope')),
    includeSubdomains: $('#subdomains').checked,
    includeRegionalDomains: $('#regional').checked,
    enabled
  };
}

function selected() {
  try {
    const id = normalizeRule(draft(false)).id;
    return snapshot?.rules.find(rule => rule.id === id);
  } catch { return undefined; }
}

function updateButton() {
  let regionalBase;
  try { regionalBase = regionalBaseForHost(normalizeRule({ ...draft(false), includeSubdomains: false, includeRegionalDomains: false }).host); }
  catch { /* The address may be incomplete while being edited. */ }
  $('#regional-option').hidden = !isManager && !regionalBase;
  if (!regionalBase) $('#regional').checked = false;
  $('#regional').disabled = busy || !regionalBase;
  const needsResume = snapshot?.state.suspended || snapshot?.state.error;
  displayedRule = selected();
  $('#toggle').textContent = t(displayedRule?.enabled && !needsResume ? 'disableSave' : 'enableSave');
  const canEdit = isManager ? Boolean(snapshot) : Boolean(tab?.id);
  if (!isManager) {
    const matching = snapshot?.matching;
    const exclusion = inheritedExclusion(matching, tab?.url);
    $('#exclude-host').hidden = !exclusion;
    $('#exclude-host').disabled = busy || !exclusion;
    $('#exclude-host').textContent = t(matching?.includeRegionalDomains ? 'excludeRegionalHost' : 'excludeSubdomain');
  }
  $('#toggle').disabled = busy || !canEdit;
  $('#save').disabled = busy || !canEdit;
  if (isManager) {
    $('#regional-help').textContent = regionalBase ? '' : t('regionalAvailability');
    $('#toggle').hidden = Boolean(editingId);
    $('#cancel-edit').hidden = !editingId;
    $('#export').disabled = busy || !snapshot;
    $('#import').disabled = busy || !snapshot;
    $('#confirm-import').disabled = busy || !pendingImport;
    $('#empty-trash').disabled = busy || !snapshot?.trash?.length;
  }
  try {
    const rule = normalizeRule(draft(false));
    $('#scope-hint').textContent = rule.includeRegionalDomains
      ? t(rule.includeSubdomains ? 'scopeRegionalFamily' : 'scopeRegional', { scope: `${rule.regionalName}.*${rule.path}` })
      : t(rule.includeSubdomains ? 'scopeFamily' : 'scopeExact', { scope: `${rule.host}${rule.path}` });
  } catch { $('#scope-hint').textContent = ''; }
}

function loadSelection() {
  updateButton();
}

function displayHost(rule) {
  return rule.includeRegionalDomains ? `${rule.regionalName}.*` : rule.host;
}

function matchesSearch(rule, query) {
  if ((displayHost(rule) + rule.path).toLowerCase().includes(query) ||
      (rule.host + rule.path).toLowerCase().includes(query)) return true;
  if (!rule.includeRegionalDomains) return false;
  try {
    const url = new URL(query.includes('://') ? query : `https://${query}`);
    return regionalDomain(url.hostname)?.name === rule.regionalName &&
      (url.pathname === '/' || rule.path.toLowerCase().startsWith(url.pathname));
  } catch { return false; }
}

function ruleHeading(rule) {
  const heading = document.createElement('div');
  heading.className = 'rule-heading';
  const address = document.createElement('span');
  address.className = 'rule-address';
  const domain = document.createElement('strong');
  domain.textContent = `${rule.includeSubdomains ? '*.' : ''}${displayHost(rule)}`;
  const path = document.createElement('span');
  path.className = 'rule-path';
  path.textContent = rule.path;
  address.append(domain, path);
  heading.append(address);
  const state = document.createElement('span');
  state.className = 'rule-state';
  state.textContent = t(rule.enabled ? 'enabled' : 'disabled');
  heading.append(state);
  return heading;
}

function groupRules(rules) {
  if (!isManager || !$('#group-domains').checked) return [[null, rules]];
  const groups = new Map();
  for (const rule of rules) {
    const domain = displayHost(rule).replace(/^www\./, '');
    if (!groups.has(domain)) groups.set(domain, []);
    groups.get(domain).push(rule);
  }
  const order = readChoice($('#sort-rules'));
  if (order === 'newest' || order === 'oldest') return groups;
  const collator = new Intl.Collator(document.documentElement.lang);
  const direction = order === 'reverse-alphabetical' ? -1 : 1;
  return [...groups].sort(([first], [second]) => direction * collator.compare(first, second));
}

function showRule(rule) {
  $('#address').value = rule ? ruleAddress(rule) : '';
  writeChoice($('#scope'), rule && rule.path !== '/' ? 'section' : 'website');
  $('#subdomains').checked = Boolean(rule?.includeSubdomains);
  $('#regional').checked = Boolean(rule?.includeRegionalDomains);
  updateButton();
}

function renderRules() {
  const rules = snapshot?.rules ?? [];
  const query = $('#search')?.value.trim().toLowerCase() ?? '';
  const visible = isManager
    ? orderRules(rules.filter(rule => matchesSearch(rule, query)),
      readChoice($('#sort-rules')), document.documentElement.lang)
    : rules.slice(0, popupRuleLimit);
  $('#rules').replaceChildren();
  $('#rule-count').textContent = visible.length < rules.length
    ? t('ruleCount', { shown: visible.length, total: rules.length }) : '';
  if (!visible.length) $('#rules').textContent = t(rules.length ? 'noSearchResults' : 'noRules');
  for (const [domain, group] of groupRules(visible)) {
    if (domain) {
      const title = document.createElement('h3');
      title.className = 'domain-group';
      title.textContent = domain;
      $('#rules').append(title);
    }
    for (const rule of group) renderRule(rule);
  }
}

function renderRule(rule) {
  const item = document.createElement('div');
  item.className = 'rule';
  item.append(ruleHeading(rule));
  $('#rules').append(item);
  if (!isManager) return;
  const actions = document.createElement('div');
  actions.className = 'rule-actions';
  const toggle = document.createElement('button');
  toggle.className = rule.enabled ? 'rule-disable' : 'rule-enable';
  toggle.textContent = t(rule.enabled ? 'disable' : 'enable');
  toggle.addEventListener('click', () => request({ type: 'update', id: rule.id, patch: { enabled: !rule.enabled } }));
  const edit = document.createElement('button');
  edit.className = 'rule-edit';
  edit.textContent = t('edit');
  edit.addEventListener('click', () => {
    editingId = rule.id;
    showRule(rule);
    $('#address').focus();
  });
  const remove = document.createElement('button');
  remove.className = 'rule-remove';
  remove.textContent = t('remove');
  remove.addEventListener('click', () => request({ type: 'remove', id: rule.id }));
  actions.append(toggle, edit, remove);
  item.append(actions);
}

function renderTrash(entries) {
  $('#trash-count').textContent = new Intl.NumberFormat(document.documentElement.lang).format(entries.length);
  const list = $('#trash-rules');
  list.replaceChildren();
  if (!entries.length) {
    const empty = document.createElement('p');
    empty.textContent = t('trashEmpty');
    list.append(empty);
  }
  for (const { id, rule } of entries) {
    const item = document.createElement('div');
    item.className = 'rule';
    item.append(ruleHeading(rule));
    const actions = document.createElement('div');
    actions.className = 'rule-actions';
    const restore = document.createElement('button');
    restore.className = 'rule-edit';
    restore.textContent = t('restoreRule');
    restore.addEventListener('click', () => request({ type: 'restore', id }));
    actions.append(restore);
    item.append(actions);
    list.append(item);
  }
}

function render(value) {
  if (value.error) throw new Error(value.error);
  snapshot = value;
  const state = value.state;
  $('#status').textContent = state.error ? errorText(state.error) : isManager ? '' : t(state.enabled ? 'active' : 'inactive');
  $('#diagnostic').textContent = JSON.stringify(value, null, 2);
  if (editingId && !value.rules.some(rule => rule.id === editingId)) {
    editingId = undefined;
    showRule();
  }
  renderRules();
  if (isManager) renderTrash(value.trash ?? []);
  updateButton();
}

async function withBusy(operation, progress, statusElement = $('#status')) {
  if (busy) return;
  busy = true;
  statusElement.textContent = progress;
  document.querySelectorAll('button, input, select').forEach(element => { element.disabled = true; });
  try {
    return await operation();
  } catch (error) {
    statusElement.textContent = errorText(error);
    $('#diagnostic').textContent = String(error.message ?? error);
  } finally {
    busy = false;
    document.querySelectorAll('button, input, select').forEach(element => { element.disabled = false; });
    updateButton();
  }
}

function request(message) {
  return withBusy(async () => {
    const value = await send(message);
    if (value.error) throw new Error(value.error);
    if (editingId && message.type === 'replace-scope') editingId = normalizeRule(message.rule).id;
    render(value);
    if (message.type === 'exclude-inherited-host' && value.matching) showRule(value.matching);
    if (isManager && (message.type === 'save' || message.type === 'replace-scope')) $('#status').textContent = t('ruleSaved');
    if (isManager && message.type === 'remove') $('#status').textContent = t('ruleTrashed');
    if (isManager && message.type === 'restore') $('#status').textContent = t('ruleRestored');
  }, t('saving'));
}

function send(message) {
  return requestWithTimeout(chrome.runtime, isManager ? message : { ...message, tabId: tab.id });
}

function saveCheckboxChange() {
  const previous = displayedRule;
  if (!previous || busy || (isManager && previous.id !== editingId)) {
    updateButton();
    return;
  }
  const rule = draft(previous.enabled);
  void withBusy(async () => {
    try {
      const value = await send({ type: 'replace-scope', id: previous.id, rule });
      if (value.error) throw new Error(value.error);
      if (editingId) editingId = normalizeRule(rule).id;
      render(value);
      if (isManager) $('#status').textContent = t('ruleSaved');
    } catch (error) {
      $('#subdomains').checked = previous.includeSubdomains;
      $('#regional').checked = Boolean(previous.includeRegionalDomains);
      throw error;
    }
  }, t('saving'));
}

async function backupRequest(message) {
  const value = await send(message);
  if (value.error) throw new Error(value.error);
  return value;
}

$('#export')?.addEventListener('click', () => withBusy(async () => {
  const { backup } = await backupRequest({ type: 'export' });
  const blob = new Blob([JSON.stringify(backup, null, 2) + '\n'], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'native-dark-mode-rules.json';
  document.body.append(link);
  try { link.click(); }
  finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000); }
  $('#backup-status').textContent = t('exportPrepared', { count: backup.rules.length });
}, t('exportPreparing'), $('#backup-status')));

$('#import')?.addEventListener('click', () => {
  $('#import-file').value = '';
  $('#import-file').click();
});

$('#import-file')?.addEventListener('change', async () => {
  const file = $('#import-file').files[0];
  if (!file) return;
  const ready = await withBusy(async () => {
    pendingImport = undefined;
    if (file.size > MAX_BACKUP_BYTES) throw new Error('Choose a JSON backup smaller than 1 MiB.');
    const text = await file.text();
    const { summary, removedIds } = await backupRequest({ type: 'preview-import', text });
    pendingImport = { text, removedIds };
    writeChoice($('#conflict-policy'), 'keep');
    $('#import-summary').textContent = t('previewSummary', { added: summary.added, matching: summary.updated });
    $('#import-status').textContent = '';
    updateImportImpact();
    $('#backup-status').textContent = t('fileValidated');
    return true;
  }, t('validating'), $('#backup-status'));
  if (ready) $('#import-preview').showModal();
});

function updateImportImpact() {
  const policy = readChoice($('#conflict-policy'));
  const replacing = policy === 'replace-all';
  $('#confirm-import').toggleAttribute('data-destructive', replacing);
  $('#import-impact').textContent = replacing
    ? t('importRemovalImpact', { count: pendingImport?.removedIds.length ?? 0 })
    : t('importKeepImpact');
}

function cancelImport() {
  pendingImport = undefined;
  $('#backup-status').textContent = t('importCanceled');
  updateButton();
}

$('#conflict-policy')?.addEventListener('change', updateImportImpact);
$('#cancel-import')?.addEventListener('click', () => {
  $('#import-preview').close();
  cancelImport();
});
$('#import-preview')?.addEventListener('cancel', event => {
  if (busy) event.preventDefault();
  else cancelImport();
});

$('#confirm-import')?.addEventListener('click', async () => {
  if (!pendingImport || busy) return;
  const imported = await withBusy(async () => {
    const value = await backupRequest({ type: 'import', text: pendingImport.text,
      confirmedRemovalIds: pendingImport.removedIds, conflictPolicy: readChoice($('#conflict-policy')) });
    render(value);
    const { added, updated, skipped } = value.importSummary;
    pendingImport = undefined;
    $('#import-preview').close();
    $('#backup-status').textContent = t('importSaved', { added, updated, skipped });
    return true;
  }, t('importing'), $('#import-status'));
  (imported ? $('#import') : $('#confirm-import')).focus();
});

$('#language')?.addEventListener('change', () => withBusy(async () => {
  await setLanguage($('#language').value);
  translatePage();
  refreshAppearance?.();
  if (snapshot) render(snapshot);
  $('#backup-status').textContent = '';
}, t('changingLanguage'), $('#backup-status')));

$('#toggle').addEventListener('click', () => {
  const needsResume = snapshot?.state.suspended || snapshot?.state.error;
  void request({ type: 'save', rule: draft(!selected()?.enabled || Boolean(needsResume)) });
});
$('#save').addEventListener('click', () => request({
  type: editingId ? 'replace-scope' : 'save', id: editingId, rule: draft(selected()?.enabled ?? false)
}));
$('#cancel-edit')?.addEventListener('click', () => { editingId = undefined; showRule(); });
$('#search')?.addEventListener('input', renderRules);
async function saveListPreferences() {
  renderRules();
  try {
    await chrome.storage.local.set({ ruleListPreferences: { order: readChoice($('#sort-rules')), group: $('#group-domains').checked } });
  } catch (error) { $('#status').textContent = errorText(error); }
}
$('#sort-rules')?.addEventListener('change', saveListPreferences);
$('#group-domains')?.addEventListener('change', saveListPreferences);
$('#empty-trash')?.addEventListener('click', async () => {
  const ids = snapshot?.trash?.map(entry => entry.id) ?? [];
  if (!ids.length || !window.confirm(t('confirmEmptyTrash'))) return;
  await withBusy(async () => {
    render(await send({ type: 'empty-trash', ids }));
    $('#trash-status').textContent = t('trashEmptied');
  }, t('saving'), $('#trash-status'));
  ($('#empty-trash').disabled ? $('#trash-title') : $('#empty-trash')).focus();
});
$('#manage')?.addEventListener('click', async () => {
  try { await chrome.runtime.openOptionsPage(); }
  catch (error) { $('#status').textContent = errorText(error); }
});
$('#exclude-host')?.addEventListener('click', () => request({ type: 'exclude-inherited-host', url: tab.url }));
$('#address').addEventListener('input', loadSelection);
$('#scope').addEventListener('change', loadSelection);
$('#subdomains').addEventListener('change', saveCheckboxChange);
$('#regional').addEventListener('change', saveCheckboxChange);

try {
  const language = await initializeLanguage();
  translatePage();
  refreshAppearance = await initializeAppearance();
  if (isManager) {
    $('#language').value = language;
    const { ruleListPreferences } = await chrome.storage.local.get('ruleListPreferences');
    writeChoice($('#sort-rules'), ruleListPreferences?.order ?? 'alphabetical');
    $('#group-domains').checked = Boolean(ruleListPreferences?.group);
  }
  if (!isManager) {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('The active tab could not be found.');
    if (!/^https?:\/\//i.test(tab.url ?? '')) throw new Error('Open an HTTP or HTTPS page to manage rules.');
    $('#site').textContent = new URL(tab.url).hostname;
    $('#address').value = tab.url;
  }
  render(await send({ type: 'status' }));
  if (snapshot.matching) showRule(snapshot.matching);
  updateButton();
} catch (error) {
  tab = undefined;
  $('#status').textContent = errorText(error);
  updateButton();
}
