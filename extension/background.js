import { DarkModeController } from './controller.js';

const controller = new DarkModeController(chrome);
const report = error => console.warn('Native Dark Mode:', error);

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (sender.id !== chrome.runtime.id || !Number.isInteger(message?.tabId)) return;
  let result;
  if (message.type === 'status') result = controller.read(message.tabId);
  else if (message.type === 'set' && typeof message.enabled === 'boolean') {
    result = controller.set(message.tabId, message.enabled);
  } else return;
  result.then(reply, error => reply({ enabled: false, error: String(error.message ?? error) }));
  return true;
});

chrome.tabs.onUpdated.addListener((tabId, change) => {
  if (change.status === 'loading' || change.status === 'complete') {
    void controller.navigation(tabId).catch(report);
  }
});
chrome.debugger.onDetach.addListener((source, reason) => {
  if (source.tabId !== undefined) void controller.disconnected(source.tabId, reason).catch(report);
});
chrome.tabs.onRemoved.addListener(tabId => {
  void controller.enqueue(tabId, () => chrome.storage.session.remove(`tab:${tabId}`)).catch(report);
});
