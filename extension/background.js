import { DarkModeController } from './controller.js';
import { RuleManager, isExtensionStore, isSeparatorEmphasis, matchingRule } from './rules.js';
import { createBackup, importBackup, mergeRules, parseConfigurationBackup } from './backup.js';

const controller = new DarkModeController(chrome);
const manager = new RuleManager(chrome, controller);
const report = error => console.warn('Native Dark Mode:', error);

async function snapshot(tabId) {
  if (tabId === undefined) return { state: {}, ...await manager.configuration() };
  const rules = await manager.list();
  const tab = await chrome.tabs.get(tabId);
  return { state: await controller.read(tabId), rules,
    matching: isExtensionStore(tab.pendingUrl ?? tab.url) ? undefined : matchingRule(rules, tab.url ?? '') };
}

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (sender.id !== chrome.runtime.id || !message) return;
  if (message.type === 'website-preset' && Number.isInteger(sender.tab?.id)) {
    // Only return the active preset. Embedded documents do not receive stored rules.
    if (isExtensionStore(sender.tab.url)) {
      reply({});
      return;
    }
    void controller.read(sender.tab.id).then(async state => {
      if (!state.preset) return {};
      const rule = matchingRule(await manager.list(), sender.tab.url ?? '');
      return rule?.enabled && rule.preset === state.preset
        ? { preset: state.preset, emphasizeSeparators: rule.emphasizeSeparators } : {};
    }).then(reply, () => reply({}));
    return true;
  }
  const fromManager = sender.url === chrome.runtime.getURL('options.html');
  if (!fromManager && !Number.isInteger(message.tabId)) return;
  const result = (async () => {
    if (fromManager && message.type === 'empty-trash' && Array.isArray(message.ids)) {
      await manager.emptyTrash(message.ids);
      return snapshot(undefined);
    }
    if (fromManager && message.type === 'save-defaults') {
      await manager.saveDefaults(message.value);
      return snapshot(undefined);
    }
    if (message.type === 'export') {
      const configuration = await manager.enqueueMutation(() => manager.configuration());
      return { backup: createBackup(configuration.rules, configuration) };
    }
    if (message.type === 'preview-import') {
      const existing = await manager.list();
      const incoming = parseConfigurationBackup(message.text);
      const { summary, removedIds } = mergeRules(existing, incoming.rules, 'replace-all');
      const removalSet = new Set(removedIds);
      return { summary, removedRules: existing.filter(rule => removalSet.has(rule.id)),
        available: { rules: true, trash: Object.hasOwn(incoming, 'trash'), ruleDefaults: Object.hasOwn(incoming, 'ruleDefaults') },
        trashCount: incoming.trash?.length ?? 0, ruleDefaults: incoming.ruleDefaults };
    }
    if (message.type === 'import') {
      const summary = await importBackup(manager, message.text, message.conflictPolicy, message.confirmedRemovalIds, message.selection);
      // Imported settings respect tabs paused by the user. Do not wait for all
      // debugger operations before acknowledging the saved configuration.
      if (!message.selection || message.selection.rules === true) void manager.applyAll().catch(report);
      return { ...await snapshot(message.tabId), importSummary: summary };
    }
    if (message.type === 'save') await manager.save(message.rule, fromManager ? undefined : message.replacedSectionId);
    else if (message.type === 'exclude-inherited-host') await manager.excludeInheritedHost(message.tabId, message.url);
    else if (message.type === 'replace-scope') await manager.replaceScope(message.id, message.rule);
    else if (message.type === 'update') await manager.update(message.id, message.patch ?? {});
    else if (message.type === 'remove') await manager.remove(message.id);
    else if (message.type === 'remove-group' && fromManager && Array.isArray(message.ids)) await manager.removeMany(message.ids);
    else if (message.type === 'restore') await manager.restore(message.id);
    else if (message.type !== 'status') throw new Error('Unknown request.');
    if (message.type === 'status' && !fromManager) {
      const current = await snapshot(message.tabId);
      if (current.matching?.enabled && current.matching.preset !== undefined &&
          (current.state.preset !== current.matching.preset ||
            current.state.emphasizeSeparators !== current.matching.emphasizeSeparators)) {
        void manager.apply(message.tabId).catch(report);
      }
      return current;
    }
    if (message.type !== 'status') {
      if (fromManager) void manager.applyAll().catch(report);
      else if (message.type === 'update' && isSeparatorEmphasis(message.patch?.emphasizeSeparators)) {
        // A saved appearance preference must survive a delayed or failed renderer update.
        void manager.applyFromPopup(message.tabId, false).catch(report);
      }
      else await manager.applyFromPopup(message.tabId, !['replace-scope', 'remove'].includes(message.type));
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
