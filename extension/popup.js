import { normalizeRule, regionalDomainsForHost, ruleAddress } from './rules.js';
import { requestWithTimeout } from './request.js';
import { MAX_BACKUP_BYTES } from './backup.js';
import { LANGUAGES, initializeLanguage, setLanguage, translatePage, t, errorText } from './i18n.js';

const $ = selector => document.querySelector(selector);
const isManager = document.documentElement.dataset.page === 'options';
const popupRuleLimit = 5;
let tab;
let snapshot;
let busy = false;
let pendingImport;
let pendingPreviewSummary;
let displayedRule;
let editingId;

for (const [code, name] of Object.entries(LANGUAGES)) {
  const option = document.createElement('option');
  option.value = code;
  option.textContent = name;
  $('#language')?.append(option);
}

function draft(enabled) {
  return {
    url: $('#address').value.trim(), scope: $('#scope').value,
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
  let domains = [];
  try { domains = regionalDomainsForHost(normalizeRule({ ...draft(false), includeRegionalDomains: false }).host); }
  catch { /* The address may be incomplete while being edited. */ }
  $('#regional-option').hidden = !domains.length;
  if (!domains.length) $('#regional').checked = false;
  $('#regional').disabled = busy || !domains.length;
  const needsResume = snapshot?.state.suspended || snapshot?.state.error;
  displayedRule = selected();
  $('#toggle').textContent = t(displayedRule?.enabled && !needsResume ? 'disableSave' : 'enableSave');
  const canEdit = isManager ? Boolean(snapshot) : Boolean(tab?.id);
  $('#toggle').disabled = busy || !canEdit;
  $('#save').disabled = busy || !canEdit;
  if (isManager) {
    $('#toggle').hidden = Boolean(editingId);
    $('#cancel-edit').hidden = !editingId;
    $('#export').disabled = busy || !snapshot;
    $('#import').disabled = busy || !snapshot;
    $('#confirm-import').disabled = busy || !pendingImport;
  }
  try {
    const rule = normalizeRule(draft(false));
    $('#scope-hint').textContent = rule.includeRegionalDomains
      ? t(rule.includeSubdomains ? 'scopeRegionalFamily' : 'scopeRegional', { scope: domains.map(domain => domain + rule.path).join(', ') })
      : t(rule.includeSubdomains ? 'scopeFamily' : 'scopeExact', { scope: `${rule.host}${rule.path}` });
  } catch { $('#scope-hint').textContent = ''; }
}

function loadSelection() {
  updateButton();
}

function scopesFor(rule) {
  const hosts = rule.includeRegionalDomains ? regionalDomainsForHost(rule.host) : [rule.host];
  return hosts.map(host => `${rule.includeSubdomains ? '*.' : ''}${host}${rule.path}`).join(', ');
}

function showRule(rule) {
  $('#address').value = rule ? ruleAddress(rule) : '';
  $('#scope').value = rule && rule.path !== '/' ? 'section' : 'website';
  $('#subdomains').checked = Boolean(rule?.includeSubdomains);
  $('#regional').checked = Boolean(rule?.includeRegionalDomains);
  updateButton();
}

function renderRules() {
  const rules = snapshot?.rules ?? [];
  const query = $('#search')?.value.trim().toLowerCase() ?? '';
  const visible = isManager ? rules.filter(rule => scopesFor(rule).includes(query)) : rules.slice(0, popupRuleLimit);
  $('#rules').replaceChildren();
  $('#rule-count').textContent = visible.length < rules.length
    ? t('ruleCount', { shown: visible.length, total: rules.length }) : '';
  if (!visible.length) $('#rules').textContent = t(rules.length ? 'noSearchResults' : 'noRules');
  for (const rule of visible) {
    const item = document.createElement('div');
    item.className = 'rule';
    const text = document.createElement('div');
    text.textContent = `${scopesFor(rule)} — ${t(rule.enabled ? 'enabled' : 'disabled')}`;
    item.append(text);
    $('#rules').append(item);
    if (!isManager) continue;
    const toggle = document.createElement('button');
    toggle.textContent = t(rule.enabled ? 'disable' : 'enable');
    toggle.addEventListener('click', () => request({ type: 'update', id: rule.id, patch: { enabled: !rule.enabled } }));
    const edit = document.createElement('button');
    edit.textContent = t('edit');
    edit.addEventListener('click', () => {
      editingId = rule.id;
      showRule(rule);
      $('#address').focus();
    });
    const remove = document.createElement('button');
    remove.textContent = t('remove');
    remove.addEventListener('click', () => request({ type: 'remove', id: rule.id }));
    item.append(toggle, edit, remove);
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
    if (isManager && (message.type === 'save' || message.type === 'replace-scope')) $('#status').textContent = t('ruleSaved');
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

$('#import-file')?.addEventListener('change', () => {
  const file = $('#import-file').files[0];
  if (!file) return;
  void withBusy(async () => {
    pendingImport = undefined;
    pendingPreviewSummary = undefined;
    $('#import-preview').hidden = true;
    if (file.size > MAX_BACKUP_BYTES) throw new Error('Choose a JSON backup smaller than 1 MiB.');
    const text = await file.text();
    const { summary } = await backupRequest({ type: 'preview-import', text });
    pendingImport = text;
    $('#conflict-policy').value = 'keep';
    pendingPreviewSummary = summary;
    $('#import-summary').textContent = t('previewSummary', { added: summary.added, matching: summary.skipped });
    $('#import-preview').hidden = false;
    $('#backup-status').textContent = t('fileValidated');
  }, t('validating'), $('#backup-status'));
});

$('#cancel-import')?.addEventListener('click', () => {
  pendingImport = undefined;
  pendingPreviewSummary = undefined;
  $('#import-preview').hidden = true;
  $('#backup-status').textContent = t('importCanceled');
  updateButton();
});

$('#confirm-import')?.addEventListener('click', () => withBusy(async () => {
  if (pendingImport === undefined) throw new Error('Select a JSON backup first.');
  const value = await backupRequest({ type: 'import', text: pendingImport, conflictPolicy: $('#conflict-policy').value });
  render(value);
  const { added, updated, skipped } = value.importSummary;
  pendingImport = undefined;
  pendingPreviewSummary = undefined;
  $('#import-preview').hidden = true;
  $('#backup-status').textContent = t('importSaved', { added, updated, skipped });
}, t('importing'), $('#backup-status')));

$('#language')?.addEventListener('change', () => withBusy(async () => {
  await setLanguage($('#language').value);
  translatePage();
  if (snapshot) render(snapshot);
  if (pendingPreviewSummary) {
    $('#import-summary').textContent = t('previewSummary', {
      added: pendingPreviewSummary.added, matching: pendingPreviewSummary.skipped
    });
  }
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
$('#manage')?.addEventListener('click', async () => {
  try { await chrome.runtime.openOptionsPage(); }
  catch (error) { $('#status').textContent = errorText(error); }
});
$('#address').addEventListener('input', loadSelection);
$('#scope').addEventListener('change', loadSelection);
$('#subdomains').addEventListener('change', saveCheckboxChange);
$('#regional').addEventListener('change', saveCheckboxChange);

try {
  const language = await initializeLanguage();
  if (isManager) $('#language').value = language;
  translatePage();
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
