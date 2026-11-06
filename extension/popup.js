import { normalizeRule } from './rules.js';
import { requestWithTimeout } from './request.js';

const $ = selector => document.querySelector(selector);
let tab;
let snapshot;
let busy = false;

function draft(enabled) {
  return {
    url: $('#address').value.trim(), scope: $('#scope').value,
    includeSubdomains: $('#subdomains').checked,
    applyToImages: $('#images').checked, enabled
  };
}

function selected() {
  try {
    const id = normalizeRule(draft(false)).id;
    return snapshot?.rules.find(rule => rule.id === id);
  } catch { return undefined; }
}

function updateButton() {
  const needsResume = snapshot?.state.suspended || snapshot?.state.error;
  $('#toggle').textContent = selected()?.enabled && !needsResume ? 'Disable and save' : 'Enable and save';
  $('#toggle').disabled = busy || !tab?.id;
  $('#save').disabled = busy || !tab?.id;
}

function loadSelection() {
  const rule = selected();
  if (rule) $('#images').checked = rule.applyToImages;
  updateButton();
}

function render(value) {
  if (value.error) throw new Error(value.error);
  snapshot = value;
  const state = value.state;
  $('#status').textContent = state.error || state.imageWarning || (state.enabled ? 'Native dark mode is active in this tab.' : 'Native dark mode is inactive in this tab.');
  $('#diagnostic').textContent = JSON.stringify(value, null, 2);
  $('#rules').replaceChildren();
  if (!value.rules.length) $('#rules').textContent = 'No saved rules yet.';
  for (const rule of value.rules) {
    const item = document.createElement('div');
    item.className = 'rule';
    const text = document.createElement('div');
    text.textContent = `${rule.includeSubdomains ? '*.' : ''}${rule.host}${rule.path} — ${rule.enabled ? 'Enabled' : 'Disabled'}`;
    item.append(text);
    const toggle = document.createElement('button');
    toggle.textContent = rule.enabled ? 'Disable' : 'Enable';
    toggle.addEventListener('click', () => request({ type: 'update', id: rule.id, patch: { enabled: !rule.enabled } }));
    const edit = document.createElement('button');
    edit.textContent = 'Edit';
    edit.addEventListener('click', () => {
      $('#address').value = `https://${rule.host}${rule.path}`;
      $('#scope').value = rule.path === '/' ? 'website' : 'section';
      $('#subdomains').checked = rule.includeSubdomains;
      $('#images').checked = rule.applyToImages;
      updateButton();
    });
    const remove = document.createElement('button');
    remove.textContent = 'Remove';
    remove.addEventListener('click', () => request({ type: 'remove', id: rule.id }));
    const imageLabel = document.createElement('label');
    const images = document.createElement('input');
    images.type = 'checkbox';
    images.checked = rule.applyToImages;
    images.addEventListener('change', () => request({ type: 'update', id: rule.id, patch: { applyToImages: images.checked } }));
    imageLabel.append(images, ' Apply to images (automatic; preservation is experimental)');
    item.append(toggle, edit, remove, imageLabel);
    $('#rules').append(item);
  }
  updateButton();
}

async function request(message) {
  if (busy) return;
  busy = true;
  $('#status').textContent = 'Saving the rule and applying it to this tab…';
  document.querySelectorAll('button, input, select').forEach(element => { element.disabled = true; });
  try {
    render(await requestWithTimeout(chrome.runtime, { ...message, tabId: tab.id }));
  } catch (error) {
    $('#status').textContent = String(error.message ?? error);
  } finally {
    busy = false;
    document.querySelectorAll('button, input, select').forEach(element => { element.disabled = false; });
    updateButton();
  }
}

$('#toggle').addEventListener('click', () => {
  const needsResume = snapshot?.state.suspended || snapshot?.state.error;
  void request({ type: 'save', rule: draft(!selected()?.enabled || Boolean(needsResume)) });
});
$('#save').addEventListener('click', () => request({ type: 'save', rule: draft(selected()?.enabled ?? false) }));
$('#address').addEventListener('input', loadSelection);
$('#scope').addEventListener('change', loadSelection);
$('#subdomains').addEventListener('change', loadSelection);

try {
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('The active tab could not be found.');
  if (!/^https?:\/\//i.test(tab.url ?? '')) throw new Error('Open an HTTP or HTTPS page to manage rules.');
  $('#site').textContent = new URL(tab.url).hostname;
  $('#address').value = tab.url;
  render(await requestWithTimeout(chrome.runtime, { type: 'status', tabId: tab.id }));
  // Start with the rule currently responsible for this URL, if any.
  if (snapshot.matching) {
    const rule = snapshot.matching;
    $('#address').value = `https://${rule.host}${rule.path}`;
    $('#scope').value = rule.path === '/' ? 'website' : 'section';
    $('#subdomains').checked = rule.includeSubdomains;
    $('#images').checked = rule.applyToImages;
  }
  updateButton();
} catch (error) {
  tab = undefined;
  $('#status').textContent = String(error.message ?? error);
  updateButton();
}
