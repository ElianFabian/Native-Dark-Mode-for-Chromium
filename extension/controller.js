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

  set(tabId, enabled) {
    return this.enqueue(tabId, async () => {
      const old = await this.read(tabId);
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
          await this.write(tabId, { enabled: false });
          await this.api.debugger.detach(target);
        }
        return await this.write(tabId, { enabled: false });
      } catch (error) {
        // Release our connection if the command fails.
        if (attached) {
          try { await this.api.debugger.detach(target); } catch {}
        }
        return await this.write(tabId, { enabled: false, error: String(error.message ?? error) });
      }
    });
  }

  navigation(tabId) {
    return this.enqueue(tabId, async () => {
      if (!(await this.read(tabId)).enabled) return;
      try {
        await this.api.debugger.sendCommand({ tabId }, 'Emulation.setAutoDarkModeOverride', { enabled: true });
      } catch (error) {
        try { await this.api.debugger.detach({ tabId }); } catch {}
        await this.write(tabId, { enabled: false, error: String(error.message ?? error) });
      }
    });
  }

  disconnected(tabId, reason) {
    // Do not reconnect: the user may have canceled or opened DevTools.
    return this.enqueue(tabId, async () => {
      if ((await this.read(tabId)).enabled) {
        await this.write(tabId, { enabled: false, error: `Connection ended (${reason}). You can enable it again manually.` });
      }
    });
  }
}
