import { DarkModeController } from './controller.js';
import { RuleManager, matchingRule } from './rules.js';
import { createBackup, importBackup, mergeRules, parseBackup } from './backup.js';

const controller = new DarkModeController(chrome);
const manager = new RuleManager(chrome, controller);
const report = error => console.warn('Native Dark Mode:', error);

async function snapshot(tabId) {
  const rules = await manager.list();
  if (tabId === undefined) return { state: {}, rules, trash: await manager.listTrash() };
  const tab = await chrome.tabs.get(tabId);
  return { state: await controller.read(tabId), rules, matching: matchingRule(rules, tab.url ?? '') };
}

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (sender.id !== chrome.runtime.id || !message) return;
  const fromManager = sender.url === chrome.runtime.getURL('options.html');
  if (!fromManager && !Number.isInteger(message.tabId)) return;
  const result = (async () => {
    if (fromManager && message.type === 'empty-trash' && Array.isArray(message.ids)) {
      await manager.emptyTrash(message.ids);
      return snapshot(undefined);
    }
    if (message.type === 'export') return { backup: createBackup(await manager.list()) };
    if (message.type === 'preview-import') {
      const { summary, removedIds } = mergeRules(await manager.list(), parseBackup(message.text), 'replace-all');
      return { summary, removedIds };
    }
    if (message.type === 'import') {
      const summary = await importBackup(manager, message.text, message.conflictPolicy, message.confirmedRemovalIds);
      // Imported settings respect tabs paused by the user. Do not wait for all
      // debugger operations before acknowledging the saved configuration.
      void manager.applyAll().catch(report);
      return { ...await snapshot(message.tabId), importSummary: summary };
    }
    if (message.type === 'save') await manager.save(message.rule);
    else if (message.type === 'exclude-inherited-host') await manager.excludeInheritedHost(message.tabId, message.url);
    else if (message.type === 'replace-scope') await manager.replaceScope(message.id, message.rule);
    else if (message.type === 'update') await manager.update(message.id, message.patch ?? {});
    else if (message.type === 'remove') await manager.remove(message.id);
    else if (message.type === 'restore') await manager.restore(message.id);
    else if (message.type !== 'status') throw new Error('Unknown request.');
    if (message.type !== 'status') {
      if (fromManager) void manager.applyAll().catch(report);
      else await manager.applyFromPopup(message.tabId, message.type !== 'replace-scope');
    }
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
