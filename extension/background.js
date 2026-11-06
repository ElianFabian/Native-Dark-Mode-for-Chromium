import { DarkModeController } from './controller.js';
import { RuleManager, matchingRule } from './rules.js';

const controller = new DarkModeController(chrome);
const manager = new RuleManager(chrome, controller);
const report = error => console.warn('Native Dark Mode:', error);

async function snapshot(tabId) {
  const tab = await chrome.tabs.get(tabId);
  const rules = await manager.list();
  return { state: await controller.read(tabId), rules, matching: matchingRule(rules, tab.url ?? '') };
}

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (sender.id !== chrome.runtime.id || !Number.isInteger(message?.tabId)) return;
  const result = (async () => {
    if (message.type === 'save') await manager.save(message.rule);
    else if (message.type === 'update') await manager.update(message.id, message.patch ?? {});
    else if (message.type === 'remove') await manager.remove(message.id);
    else if (message.type !== 'status') throw new Error('Unknown request.');
    if (message.type !== 'status') await manager.applyFromPopup(message.tabId);
    return snapshot(message.tabId);
  })();
  result.then(reply, error => reply({ error: String(error.message ?? error) }));
  return true;
});

chrome.tabs.onUpdated.addListener((tabId, change) => {
  if (change.url || change.status === 'loading' || change.status === 'complete') {
    void manager.apply(tabId).catch(report);
  }
});
chrome.runtime.onStartup.addListener(() => { void manager.applyAll().catch(report); });
chrome.runtime.onInstalled.addListener(() => { void manager.applyAll().catch(report); });
chrome.debugger.onDetach.addListener((source, reason) => {
  if (source.tabId !== undefined) void controller.disconnected(source.tabId, reason).catch(report);
});
chrome.tabs.onRemoved.addListener(tabId => {
  void controller.enqueue(tabId, () => chrome.storage.session.remove(`tab:${tabId}`)).catch(report);
});
