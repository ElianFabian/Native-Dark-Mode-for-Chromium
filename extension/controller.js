export class DarkModeController {
  constructor(api) {
    this.api = api;
    this.queues = new Map();
  }

  async read(tabId) {
    const key = `tab:${tabId}`;
    return (await this.api.storage.session.get(key))[key] ?? { enabled: false };
  }

  async write(tabId, value) {
    await this.api.storage.session.set({ [`tab:${tabId}`]: value });
    await this.api.action.setBadgeText({ tabId, text: value.enabled ? 'ON' : value.error ? '!' : '' });
    await this.api.action.setBadgeBackgroundColor({ tabId, color: value.error ? '#b45309' : '#2563eb' });
    return value;
  }

  enqueue(tabId, operation) {
    const next = (this.queues.get(tabId) ?? Promise.resolve()).catch(() => {}).then(operation);
    this.queues.set(tabId, next);
    void next.finally(() => {
      if (this.queues.get(tabId) === next) this.queues.delete(tabId);
    }).catch(() => {});
    return next;
  }

  reconcile(tabId, resolveRule, automatic) {
    return this.enqueue(tabId, async () => {
      let state = await this.read(tabId);
      if (automatic && state.suspended) return state;
      const rule = await resolveRule();
      const preset = rule?.enabled ? rule.preset : undefined;
      if (preset) {
        const { emphasizeSeparators } = rule;
        const settings = { preset, ...(emphasizeSeparators ? { emphasizeSeparators } : {}) };
        if (state.enabled && !state.preset) {
          return this.applyNative(tabId, false, state, settings);
        }
        const next = state.preset === preset && state.emphasizeSeparators === settings.emphasizeSeparators
          ? state : await this.write(tabId, { enabled: true, ...settings });
        try { await this.sendPreset(tabId, settings); }
        catch (error) {
          if (next !== state) await this.write(tabId, state);
          throw error;
        }
        return next;
      }
      if (state.preset) {
        if (rule?.enabled) return this.applyNative(tabId, true, state);
        const previous = state;
        state = await this.write(tabId, { enabled: false });
        try { await this.sendPreset(tabId); }
        catch (error) {
          await this.write(tabId, previous);
          throw error;
        }
      }
      if (!rule?.enabled && !state.enabled) return state;
      return this.applyNative(tabId, Boolean(rule?.enabled), state);
    });
  }

  async sendPreset(tabId, settings = {}, immediate = false) {
    const { preset, emphasizeSeparators } = settings;
    // A tab can still have the content script from before the extension reload.
    // Older scripts accept v3 but treat unrecognized presets as disabled.
    const message = { type: preset === 'chromium' || immediate ? 'apply-website-preset-v4' : 'apply-website-preset-v3',
      preset, ...(emphasizeSeparators ? { emphasizeSeparators } : {}), ...(immediate ? { immediate: true } : {}) };
    if (preset) {
      let applied;
      try {
        applied = await this.api.tabs.sendMessage(tabId, message, { frameId: 0 });
      } catch (error) {
        if (!this.isMissingReceiver(error)) throw error;
      }
      if (applied === undefined) {
        // A tab opened before the extension reload may lack the current script.
        const target = { tabId };
        try {
          await this.api.scripting.executeScript({ target: { ...target, allFrames: true },
            files: ['chromium-colors.js', 'image-contrast.js', 'website-theme.js'] });
        } catch {
          // A restricted child frame can prevent injection into the entire tab.
          await this.api.scripting.executeScript({ target, files: ['chromium-colors.js', 'image-contrast.js', 'website-theme.js'] });
        }
        applied = await this.api.tabs.sendMessage(tabId, message, { frameId: 0 });
      }
      if (applied !== true) throw new Error('Website theme could not be applied to the page.');
    }
    try { await this.api.tabs.sendMessage(tabId, message); }
    catch (error) {
      if (!this.isMissingReceiver(error)) throw error;
    }
  }

  isMissingReceiver(error) {
    return /Receiving end does not exist|message port closed/i.test(error.message);
  }

  async applyNative(tabId, enabled, old, replacementPreset) {
    const target = { tabId };
    let attached = old.enabled && !old.preset;
    let clearingPreset = false;
    try {
      if (enabled) {
        const tab = await this.api.tabs.get(tabId);
        if (!/^https?:\/\//i.test(tab.url ?? '')) {
          throw new Error('Open an HTTP or HTTPS page. Internal browser pages are not supported in this prototype.');
        }
        if (!attached) {
          await this.api.debugger.attach(target, '1.3');
          attached = true;
        }
        await this.api.debugger.sendCommand(target, 'Emulation.setAutoDarkModeOverride', { enabled: true });
        if (old.preset) {
          clearingPreset = true;
          await this.sendPreset(tabId);
        }
        return await this.write(tabId, { enabled: true });
      }
      if (attached) {
        // Prepare the CSS renderer while Native is still covering the page.
        if (replacementPreset) await this.sendPreset(tabId, replacementPreset, true);
        // Clear the override before releasing the connection.
        await this.api.debugger.sendCommand(target, 'Emulation.setAutoDarkModeOverride', {});
        if (replacementPreset) {
          await this.api.debugger.detach(target);
          attached = false;
          return await this.write(tabId, { enabled: true, ...replacementPreset });
        }
        const state = await this.write(tabId, { enabled: false });
        await this.api.debugger.detach(target);
        return state;
      }
      return await this.write(tabId, { enabled: false });
    } catch (error) {
      if (replacementPreset) {
        try { await this.sendPreset(tabId); } catch {}
      }
      // Release our connection if the command fails.
      if (attached) {
        try { await this.api.debugger.sendCommand(target, 'Emulation.setAutoDarkModeOverride', {}); } catch {}
        try { await this.api.debugger.detach(target); } catch {}
      }
      if (enabled && old.preset) {
        try {
          if (clearingPreset) await this.sendPreset(tabId, old, true);
          return await this.write(tabId, { ...old, error: String(error.message ?? error) });
        } catch {}
      }
      return await this.write(tabId, { enabled: false, error: String(error.message ?? error) });
    }
  }

  disconnected(tabId, reason) {
    // Do not reconnect: the user may have canceled or opened DevTools.
    return this.enqueue(tabId, async () => {
      const state = await this.read(tabId);
      if (state.enabled && !state.preset) {
        await this.write(tabId, { enabled: false, suspended: true, error: `Connection ended (${reason}). Automatic activation is paused for this tab. Enable it manually to resume.` });
      }
    });
  }
}
