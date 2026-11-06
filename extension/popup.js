const toggle = document.querySelector('#toggle');
const status = document.querySelector('#status');
let tab;
let current;

function render(value) {
  current = value;
  status.textContent = value.error || (value.enabled ? 'Enabled in this tab.' : 'Disabled.');
  toggle.textContent = value.enabled ? 'Disable' : 'Enable dark mode';
  document.querySelector('#diagnostic').textContent = JSON.stringify({ tabId: tab?.id, ...value }, null, 2);
  toggle.disabled = !/^https?:\/\//i.test(tab?.url ?? '');
}

try {
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('The active tab could not be found.');
  document.querySelector('#site').textContent = tab.url ? new URL(tab.url).hostname : 'Page unavailable';
  render(await chrome.runtime.sendMessage({ type: 'status', tabId: tab.id }));
} catch (error) {
  status.textContent = String(error.message ?? error);
}

toggle.addEventListener('click', async () => {
  toggle.disabled = true;
  try {
    render(await chrome.runtime.sendMessage({ type: 'set', tabId: tab.id, enabled: !current.enabled }));
  } catch (error) {
    render({ enabled: false, error: String(error.message ?? error) });
  }
});
