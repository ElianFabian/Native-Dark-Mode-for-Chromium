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
        if (state.enabled && !state.preset) {
          state = await this.applyNative(tabId, false, state);
          if (state.error) return state;
        }
        const next = state.preset === preset ? state : await this.write(tabId, { enabled: true, preset });
        try { await this.sendPreset(tabId, preset); }
        catch (error) {
          if (next !== state) await this.write(tabId, state);
          throw error;
        }
        return next;
      }
      if (state.preset) {
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

  async sendPreset(tabId, preset) {
    try { await this.api.tabs.sendMessage(tabId, { type: 'apply-website-preset', preset }); }
    catch (error) {
      // The document may still be loading. Its content script requests the preset on startup.
      if (!/Receiving end does not exist|message port closed/i.test(error.message)) throw error;
    }
  }

  async applyNative(tabId, enabled, old) {
    const target = { tabId };
    let attached = old.enabled;
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
        return await this.write(tabId, { enabled: true });
      }
      if (attached) {
        // Clear the override before releasing the connection.
        await this.api.debugger.sendCommand(target, 'Emulation.setAutoDarkModeOverride', {});
        const state = await this.write(tabId, { enabled: false });
        await this.api.debugger.detach(target);
        return state;
      }
      return await this.write(tabId, { enabled: false });
    } catch (error) {
      // Release our connection if the command fails.
      if (attached) {
        try { await this.api.debugger.detach(target); } catch {}
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
