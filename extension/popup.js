import { normalizeRule, regionalDomainsForHost, ruleAddress } from './rules.js';
import { requestWithTimeout } from './request.js';
import { MAX_BACKUP_BYTES } from './backup.js';
import { LANGUAGES, initializeLanguage, setLanguage, translatePage, t, errorText } from './i18n.js';

const $ = selector => document.querySelector(selector);
let tab;
let snapshot;
let busy = false;
let pendingImport;
let pendingPreviewSummary;
let displayedRule;

for (const [code, name] of Object.entries(LANGUAGES)) {
  const option = document.createElement('option');
  option.value = code;
  option.textContent = name;
  $('#language').append(option);
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
  $('#toggle').disabled = busy || !tab?.id;
  $('#save').disabled = busy || !tab?.id;
  $('#export').disabled = busy || !snapshot;
  $('#import').disabled = busy || !snapshot;
  $('#confirm-import').disabled = busy || !pendingImport;
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

function render(value) {
  if (value.error) throw new Error(value.error);
  snapshot = value;
  const state = value.state;
  $('#status').textContent = state.error ? errorText(state.error) : t(state.enabled ? 'active' : 'inactive');
  $('#diagnostic').textContent = JSON.stringify(value, null, 2);
  $('#rules').replaceChildren();
  if (!value.rules.length) $('#rules').textContent = t('noRules');
  for (const rule of value.rules) {
    const item = document.createElement('div');
    item.className = 'rule';
    const text = document.createElement('div');
    const hosts = rule.includeRegionalDomains ? regionalDomainsForHost(rule.host) : [rule.host];
    const scopes = hosts.map(host => `${rule.includeSubdomains ? '*.' : ''}${host}${rule.path}`);
    text.textContent = `${scopes.join(', ')} — ${t(rule.enabled ? 'enabled' : 'disabled')}`;
    item.append(text);
    const toggle = document.createElement('button');
    toggle.textContent = t(rule.enabled ? 'disable' : 'enable');
    toggle.addEventListener('click', () => request({ type: 'update', id: rule.id, patch: { enabled: !rule.enabled } }));
    const edit = document.createElement('button');
    edit.textContent = t('edit');
    edit.addEventListener('click', () => {
      $('#address').value = ruleAddress(rule);
      $('#scope').value = rule.path === '/' ? 'website' : 'section';
      $('#subdomains').checked = rule.includeSubdomains;
      $('#regional').checked = Boolean(rule.includeRegionalDomains);
      updateButton();
    });
    const remove = document.createElement('button');
    remove.textContent = t('remove');
    remove.addEventListener('click', () => request({ type: 'remove', id: rule.id }));
    item.append(toggle, edit, remove);
    $('#rules').append(item);
  }
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
    render(await requestWithTimeout(chrome.runtime, { ...message, tabId: tab.id }));
  }, t('saving'));
}

function saveCheckboxChange() {
  const previous = displayedRule;
  if (!previous || busy) {
    updateButton();
    return;
  }
  const rule = draft(previous.enabled);
  void withBusy(async () => {
    try {
      render(await requestWithTimeout(chrome.runtime, {
        type: 'replace-scope', id: previous.id, rule, tabId: tab.id
      }));
    } catch (error) {
      $('#subdomains').checked = previous.includeSubdomains;
      $('#regional').checked = Boolean(previous.includeRegionalDomains);
      throw error;
    }
  }, t('saving'));
}

async function backupRequest(message) {
  const value = await requestWithTimeout(chrome.runtime, { ...message, tabId: tab.id });
  if (value.error) throw new Error(value.error);
  return value;
}

$('#export').addEventListener('click', () => withBusy(async () => {
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

$('#import').addEventListener('click', () => {
  $('#import-file').value = '';
  $('#import-file').click();
});

$('#import-file').addEventListener('change', () => {
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

$('#cancel-import').addEventListener('click', () => {
  pendingImport = undefined;
  pendingPreviewSummary = undefined;
  $('#import-preview').hidden = true;
  $('#backup-status').textContent = t('importCanceled');
  updateButton();
});

$('#confirm-import').addEventListener('click', () => withBusy(async () => {
  if (pendingImport === undefined) throw new Error('Select a JSON backup first.');
  const value = await backupRequest({ type: 'import', text: pendingImport, conflictPolicy: $('#conflict-policy').value });
  render(value);
  const { added, updated, skipped } = value.importSummary;
  pendingImport = undefined;
  pendingPreviewSummary = undefined;
  $('#import-preview').hidden = true;
  $('#backup-status').textContent = t('importSaved', { added, updated, skipped });
}, t('importing'), $('#backup-status')));

$('#language').addEventListener('change', () => withBusy(async () => {
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
$('#save').addEventListener('click', () => request({ type: 'save', rule: draft(selected()?.enabled ?? false) }));
$('#address').addEventListener('input', loadSelection);
$('#scope').addEventListener('change', loadSelection);
$('#subdomains').addEventListener('change', saveCheckboxChange);
$('#regional').addEventListener('change', saveCheckboxChange);

try {
  $('#language').value = await initializeLanguage();
  translatePage();
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('The active tab could not be found.');
  if (!/^https?:\/\//i.test(tab.url ?? '')) throw new Error('Open an HTTP or HTTPS page to manage rules.');
  $('#site').textContent = new URL(tab.url).hostname;
  $('#address').value = tab.url;
  render(await requestWithTimeout(chrome.runtime, { type: 'status', tabId: tab.id }));
  // Start with the rule currently responsible for this URL, if any.
  if (snapshot.matching) {
    const rule = snapshot.matching;
    $('#address').value = ruleAddress(rule);
    $('#scope').value = rule.path === '/' ? 'website' : 'section';
    $('#subdomains').checked = rule.includeSubdomains;
    $('#regional').checked = Boolean(rule.includeRegionalDomains);
  }
  updateButton();
} catch (error) {
  tab = undefined;
  $('#status').textContent = errorText(error);
  updateButton();
}
