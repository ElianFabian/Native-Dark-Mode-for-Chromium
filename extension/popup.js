import { normalizeRule, orderRules, groupRulesByDomain, ruleAddress, inheritedExclusion } from './rules.js';
import { regionalBaseForHost, regionalDomain } from './domains.js';
import { requestWithTimeout } from './request.js';
import { MAX_BACKUP_BYTES } from './backup.js';
import { LANGUAGES, initializeLanguage, setLanguage, translatePage, t, errorText } from './i18n.js';
import { initializeAppearance } from './appearance.js';
import { readChoice, writeChoice } from './choices.js';

const $ = selector => document.querySelector(selector);
const isManager = document.documentElement.dataset.page === 'options';
let tab;
let snapshot;
let busy = false;
let pendingImport;
let displayedRule;
let editingId;
const openDomains = new Set();
const panelHighlightTimers = new WeakMap();
let refreshAppearance;

const appearanceMenu = $('.appearance-menu');
const appearanceTrigger = appearanceMenu?.querySelector('summary');
let openedByHover = false;
let appearanceCloseTimer;

function closeAppearanceMenu() {
  clearTimeout(appearanceCloseTimer);
  openedByHover = false;
  appearanceMenu.open = false;
}

if (appearanceMenu) {
  $('#close-appearance').addEventListener('click', () => {
    closeAppearanceMenu();
    appearanceTrigger.focus();
  });
  appearanceTrigger.addEventListener('pointerenter', event => {
    if (event.pointerType !== 'mouse' || appearanceMenu.open) return;
    appearanceMenu.open = true;
    openedByHover = true;
  });
  appearanceMenu.addEventListener('pointerenter', () => clearTimeout(appearanceCloseTimer));
  appearanceMenu.addEventListener('pointerleave', event => {
    if (event.pointerType !== 'mouse' || !openedByHover) return;
    appearanceCloseTimer = setTimeout(() => {
      if (!appearanceMenu.contains(document.activeElement)) closeAppearanceMenu();
    }, 220);
  });
  appearanceTrigger.addEventListener('click', () => {
    openedByHover = false;
    clearTimeout(appearanceCloseTimer);
  });
  document.addEventListener('pointerdown', event => {
    if (appearanceMenu.open && !appearanceMenu.contains(event.target)) closeAppearanceMenu();
  });
}

for (const trigger of document.querySelectorAll('.has-tooltip')) {
  const reset = () => trigger.removeAttribute('data-tooltip-dismissed');
  trigger.addEventListener('pointerenter', reset);
  trigger.addEventListener('focusin', reset);
}
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape' || $('#import-preview')?.open) return;
  if (appearanceMenu?.open) {
    event.preventDefault();
    closeAppearanceMenu();
    appearanceTrigger.focus();
    return;
  }
  const visible = document.querySelectorAll('.has-tooltip:not([data-tooltip-dismissed]):is(:hover, :focus-within)');
  if (!visible.length) return;
  event.preventDefault();
  visible.forEach(trigger => trigger.setAttribute('data-tooltip-dismissed', ''));
});

const languageFlags = {
  en: 'gb', es: 'es', fr: 'fr', pt_PT: 'pt', it: 'it', zh_CN: 'cn', ja: 'jp', ko: 'kr', de: 'de'
};

if (isManager) {
  const editorColumn = $('.editor-column');
  const toolbar = $('.text-size-toolbar');
  // A tall column scrolls with the page until its bottom fits in the viewport.
  new ResizeObserver(([entry]) => {
    editorColumn.style.setProperty('--editor-column-height', `${entry.borderBoxSize[0].blockSize}px`);
  }).observe(editorColumn);
  new ResizeObserver(([entry]) => {
    document.documentElement.style.setProperty('--text-toolbar-height', `${entry.borderBoxSize[0].blockSize}px`);
  }).observe(toolbar);
  for (const [code, name] of Object.entries(LANGUAGES)) {
    const option = document.createElement('option');
    const flag = document.createElement('img');
    flag.src = `flags/${languageFlags[code]}.svg`;
    flag.alt = '';
    flag.className = 'language-option-flag';
    option.value = code;
    option.append(flag, name);
    $('#language').append(option);
  }
}

function updateLanguageFlag(choice) {
  const country = languageFlags[choice];
  const flag = $('#language-current-flag');
  if (country) flag.src = `flags/${country}.svg`;
  flag.hidden = !country;
  $('#language-auto-icon').hidden = Boolean(country);
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
    updateGroupToggle();
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

function ruleHeading(rule, dateFormatter) {
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
  renderRuleState(state, rule.enabled);
  heading.append(state);
  const createdAt = new Date(rule.createdAt);
  if (Number.isFinite(createdAt.getTime())) {
    const added = document.createElement('time');
    added.className = 'rule-added';
    added.dateTime = createdAt.toISOString();
    added.textContent = t('ruleAddedDate', { date: dateFormatter.format(createdAt) });
    heading.append(added);
  }
  return heading;
}

function renderRuleState(state, enabled) {
  state.toggleAttribute('data-disabled', !enabled);
  state.textContent = t(enabled ? 'enabled' : 'disabled');
}

function selectedSortOrder() {
  const descending = $('#sort-direction').hasAttribute('data-descending');
  if (readChoice($('#sort-rules')) === 'date') return descending ? 'newest' : 'oldest';
  return descending ? 'reverse-alphabetical' : 'alphabetical';
}

function updateGroupToggle() {
  const button = $('#toggle-domain-groups');
  const hasGroups = Boolean($('#rules .domain-group'));
  button.hidden = !$('#group-domains').checked;
  button.disabled = busy || !hasGroups;
  const label = t(hasGroups && !$('#rules .domain-group:not([open])') ? 'collapseAllGroups' : 'expandAllGroups');
  if (button.textContent !== label) button.textContent = label;
}

function showRule(rule) {
  $('#address').value = rule ? ruleAddress(rule) : '';
  writeChoice($('#scope'), rule && rule.path !== '/' ? 'section' : 'website');
  $('#subdomains').checked = Boolean(rule?.includeSubdomains);
  $('#regional').checked = Boolean(rule?.includeRegionalDomains);
  updateButton();
}

function renderRules(previousEditedId) {
  const list = $('#rules');
  const rules = snapshot?.rules ?? [];
  const query = $('#search').value.trim().toLowerCase();
  const order = selectedSortOrder();
  const visible = orderRules(rules.filter(rule => matchesSearch(rule, query)), order, document.documentElement.lang);
  for (const group of list.querySelectorAll('.domain-group')) {
    if (group.open) openDomains.add(group.dataset.domain);
    else openDomains.delete(group.dataset.domain);
  }
  if (previousEditedId && previousEditedId !== editingId) {
    const previousButton = list.querySelector(`[data-rule-id="${CSS.escape(previousEditedId)}"]`);
    if (previousButton?.closest('.domain-group')?.open) {
      for (const [domain, group] of groupRulesByDomain(rules, rules, 'newest')) {
        if (group.some(rule => rule.id === editingId)) {
          openDomains.add(domain);
          break;
        }
      }
    }
  }
  list.replaceChildren();
  $('#rule-count').textContent = visible.length < rules.length
    ? t('ruleCount', { shown: visible.length, total: rules.length }) : '';
  if (!visible.length) list.textContent = t(rules.length ? 'noSearchResults' : 'noRules');
  const groups = $('#group-domains').checked
    ? groupRulesByDomain(visible, rules, order, document.documentElement.lang)
    : [[null, visible]];
  const dateFormatter = new Intl.DateTimeFormat(document.documentElement.lang, { dateStyle: 'medium' });
  for (const [domain, group] of groups) {
    let container = list;
    if (domain) {
      container = document.createElement('details');
      container.className = 'domain-group';
      container.dataset.domain = domain;
      container.open = openDomains.has(domain);
      const title = document.createElement('summary');
      title.textContent = domain;
      container.append(title);
      list.append(container);
    }
    for (const rule of group) container.append(renderRule(rule, dateFormatter));
  }
  updateGroupToggle();
}

function renderRule(rule, dateFormatter) {
  const item = document.createElement('div');
  item.className = 'rule';
  item.append(ruleHeading(rule, dateFormatter));
  const actions = document.createElement('div');
  actions.className = 'rule-actions';
  const toggle = document.createElement('button');
  toggle.dataset.ruleId = rule.id;
  toggle.append(document.createElement('span'));
  renderRuleToggle(toggle, rule.enabled, item);
  toggle.addEventListener('click', () => {
    const current = snapshot.rules.find(entry => entry.id === rule.id);
    if (current) void request({ type: 'update', id: rule.id, patch: { enabled: !current.enabled } }, { retainedButton: toggle });
  });
  const edit = document.createElement('button');
  edit.className = 'rule-edit';
  edit.textContent = t('edit');
  edit.addEventListener('click', () => {
    editingId = rule.id;
    showRule(rule);
    $('#address').focus();
    highlightPanel($('.rule-editor'));
  });
  const remove = document.createElement('button');
  remove.className = 'rule-remove';
  remove.textContent = t('remove');
  remove.addEventListener('click', () => request({ type: 'remove', id: rule.id }, { removedRow: item }));
  actions.append(toggle, edit, remove);
  item.append(actions);
  return item;
}

function highlightPanel(panel) {
  panel.classList.add('is-highlighted');
  clearTimeout(panelHighlightTimers.get(panel));
  panelHighlightTimers.set(panel, setTimeout(() => panel.classList.remove('is-highlighted'), 800));
}

async function animateRuleHeight(target, direction = 'normal') {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const height = target.getBoundingClientRect().height;
  if (!height) return;
  const animation = target.animate([
    { height: `${height}px`, opacity: 1, overflow: 'hidden', boxSizing: 'border-box' },
    { height: '0px', opacity: 0, overflow: 'hidden', boxSizing: 'border-box',
      paddingBlock: '0px', borderBlockWidth: '0px', marginBlock: '0px' }
  ], { duration: 220, easing: 'ease-in-out', direction,
    fill: direction === 'reverse' ? 'backwards' : 'forwards' });
  await animation.finished.catch(() => {});
}

function animateRuleRemoval(row) {
  const group = row.parentElement;
  return animateRuleHeight(group.matches('.domain-group') && group.childElementCount === 2 ? group : row);
}

async function revealRestoredRule(id) {
  if (!id) return;
  const row = $(`[data-rule-id="${CSS.escape(id)}"]`)?.closest('.rule');
  if (!row) return;
  const group = row.closest('.domain-group');
  if (group) {
    group.open = true;
    highlightPanel(group);
  }
  highlightPanel(row);
  row.scrollIntoView({ block: 'nearest' });
  await animateRuleHeight(row, 'reverse');
}

function renderRuleToggle(button, enabled, item = button.closest('.rule')) {
  item.toggleAttribute('data-rule-disabled', !enabled);
  button.className = enabled ? 'rule-toggle rule-disable' : 'rule-toggle rule-enable';
  button.firstElementChild.textContent = t(enabled ? 'disable' : 'enable');
  button.dataset.alternateLabel = t(enabled ? 'enable' : 'disable');
  renderRuleState(item.querySelector('.rule-state'), enabled);
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
  const dateFormatter = new Intl.DateTimeFormat(document.documentElement.lang, { dateStyle: 'medium' });
  for (const { id, rule } of entries) {
    const item = document.createElement('div');
    item.className = 'rule';
    item.append(ruleHeading(rule, dateFormatter));
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

function render(value, toggledButton, previousEditedId) {
  if (value.error) throw new Error(value.error);
  const previous = snapshot;
  snapshot = value;
  const state = value.state;
  $('#status').textContent = state.error ? errorText(state.error) : isManager ? '' : t(state.enabled ? 'active' : 'inactive');
  if (isManager) $('#diagnostic').textContent = JSON.stringify(value, null, 2);
  if (editingId && !value.rules.some(rule => rule.id === editingId)) {
    editingId = undefined;
    showRule();
  }
  const toggledRule = toggledButton && value.rules.find(rule => rule.id === toggledButton.dataset.ruleId);
  const listUnchanged = toggledRule && previous.rules.length === value.rules.length &&
    value.rules.every((rule, index) => {
      const old = previous.rules[index];
      const comparable = rule === toggledRule ? { ...rule, enabled: old.enabled } : rule;
      return JSON.stringify(comparable) === JSON.stringify(old);
    });
  if (listUnchanged) renderRuleToggle(toggledButton, toggledRule.enabled);
  else if (isManager) renderRules(previousEditedId);
  if (isManager && (!toggledButton || JSON.stringify(previous.trash) !== JSON.stringify(value.trash))) {
    renderTrash(value.trash ?? []);
  }
  updateButton();
}

async function withBusy(operation, progress, statusElement = $('#status'), retainedButton) {
  if (busy) return;
  busy = true;
  statusElement.textContent = progress;
  document.querySelectorAll('button, input, select').forEach(element => {
    if (element !== retainedButton) element.disabled = true;
  });
  try {
    return await operation();
  } catch (error) {
    statusElement.textContent = errorText(error);
    if (isManager) $('#diagnostic').textContent = String(error.message ?? error);
  } finally {
    busy = false;
    document.querySelectorAll('button, input, select').forEach(element => { element.disabled = false; });
    updateButton();
  }
}

async function request(message, { retainedButton, removedRow } = {}) {
  const hadFocus = retainedButton && document.activeElement === retainedButton;
  await withBusy(async () => {
    const restoredId = message.type === 'restore'
      ? snapshot?.trash?.find(entry => entry.id === message.id)?.rule.id
      : undefined;
    const value = await send(message);
    if (value.error) throw new Error(value.error);
    if (editingId && message.type === 'replace-scope') editingId = normalizeRule(message.rule).id;
    if (removedRow) await animateRuleRemoval(removedRow);
    render(value, retainedButton, message.type === 'replace-scope' ? message.id : undefined);
    if (message.type === 'exclude-inherited-host' && value.matching) showRule(value.matching);
    if (isManager && (message.type === 'save' || message.type === 'replace-scope')) $('#status').textContent = t('ruleSaved');
    if (isManager && message.type === 'remove') {
      $('#status').textContent = t('ruleTrashed');
      highlightPanel($('.trash-panel'));
    }
    if (isManager && message.type === 'restore') {
      $('#status').textContent = t('ruleRestored');
      await revealRestoredRule(restoredId);
    }
  }, t('saving'), $('#status'), retainedButton);
  if (hadFocus && !retainedButton.isConnected) {
    $(`[data-rule-id="${CSS.escape(message.id)}"]`)?.focus({ preventScroll: true });
  }
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
      render(value, undefined, previous.id);
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
  updateLanguageFlag($('#language').value);
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
$('#search')?.addEventListener('input', () => renderRules());
async function saveListPreferences() {
  renderRules();
  try {
    await chrome.storage.local.set({ ruleListPreferences: { order: selectedSortOrder(), group: $('#group-domains').checked } });
  } catch (error) { $('#status').textContent = errorText(error); }
}
$('#sort-rules')?.addEventListener('change', saveListPreferences);
$('#sort-direction')?.addEventListener('click', event => {
  event.currentTarget.toggleAttribute('data-descending');
  void saveListPreferences();
});
$('#group-domains')?.addEventListener('change', saveListPreferences);
$('#toggle-domain-groups')?.addEventListener('click', () => {
  const open = Boolean($('#rules .domain-group:not([open])'));
  for (const group of document.querySelectorAll('#rules .domain-group')) group.open = open;
  updateGroupToggle();
});
$('#rules')?.addEventListener('toggle', updateGroupToggle, true);
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
$('#manage-extension').addEventListener('click', async () => {
  const agent = navigator.userAgent;
  const details = `extensions/?id=${chrome.runtime.id}`;
  const url = /\bOPR\//.test(agent) ? 'opera://extensions/' :
    `${/\bEdg\//.test(agent) ? 'edge' : 'chrome'}://${details}`;
  try { await chrome.tabs.create({ url }); }
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
    updateLanguageFlag(language);
    const { ruleListPreferences } = await chrome.storage.local.get('ruleListPreferences');
    const order = ruleListPreferences?.order;
    writeChoice($('#sort-rules'), order === 'newest' || order === 'oldest' ? 'date' : 'alphabetical');
    $('#sort-direction').toggleAttribute('data-descending', order === 'newest' || order === 'reverse-alphabetical');
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
