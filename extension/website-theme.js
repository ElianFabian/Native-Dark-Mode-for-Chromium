(() => {
  // A document can already have the declarative script when it is injected on demand.
  if (globalThis.nativeDarkModeWebsiteThemeLoaded) return;
  globalThis.nativeDarkModeWebsiteThemeLoaded = true;

  const palettes = {
    soft: { base: '#252a34', surface: '#303745', raised: '#3b4454', text: '#f0f3f8', link: '#b5dcff', border: '#929eaf' },
    contrast: { base: '#080a0e', surface: '#11151d', raised: '#19212d', text: '#ffffff', link: '#c5e5ff', border: '#c2ccdc' }
  };
  const marker = 'data-native-dark-mode-paint';
  const marked = new Set();
  const pending = new Set();
  const excluded = 'script,style,link,meta,template,noscript';
  let preset;
  let sheet;
  let observer;
  let batchTimer;
  let walk;
  let revision = 0;

  function paletteCSS(colors) {
    const paint = (role, declaration) => {
      const selector = `[${marker}~="${role}"]`;
      return `${selector.repeat(3)} { ${declaration} !important; }`;
    };
    return [
      `:root:root { color-scheme: dark !important; background-color: ${colors.base} !important; color: ${colors.text} !important; }`,
      `:root body { background-color: ${colors.surface} !important; }`,
      paint('surface', `background-color: ${colors.surface}`),
      paint('raised', `background-color: ${colors.raised}`),
      paint('text', `color: ${colors.text}`),
      paint('link', `color: ${colors.link}`),
      paint('border', `border-color: ${colors.border}`),
      `:root :focus-visible { outline: 2px solid ${colors.link} !important; outline-offset: 2px; }`
    ].join('\n');
  }

  function rolesFor(element) {
    if (!(element instanceof HTMLElement) || element.matches(excluded)) return '';
    const style = getComputedStyle(element);
    const roles = [element.closest('a[href]') ? 'link' : 'text'];
    const background = style.backgroundColor.match(/^rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)$/);
    if (element !== document.documentElement && background && Number(background[4] ?? 1) > 0.05) {
      const lightness = Number(background[1]) * .213 + Number(background[2]) * .715 + Number(background[3]) * .072;
      roles.push(lightness > 180 ? 'surface' : 'raised');
    }
    if (['Top', 'Right', 'Bottom', 'Left'].some(side =>
      style[`border${side}Style`] !== 'none' && parseFloat(style[`border${side}Width`]) > 0)) roles.push('border');
    return roles.join(' ');
  }

  function schedule(root) {
    if (root?.isConnected) pending.add(root);
    if (batchTimer === undefined) batchTimer = setTimeout(paintBatch, 0);
  }

  function paintBatch() {
    batchTimer = undefined;
    const updates = [];
    // Sample the site's colors before writing any overrides for this batch.
    sheet.disabled = true;
    try {
      const started = performance.now();
      while (updates.length < 150 && performance.now() - started < 6) {
        if (!walk) {
          const root = pending.values().next().value;
          if (!root) break;
          pending.delete(root);
          if (!root.isConnected) continue;
          walk = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
          updates.push([root, rolesFor(root)]);
        } else {
          const element = walk.nextNode();
          if (!element?.isConnected) { walk = undefined; continue; }
          updates.push([element, rolesFor(element)]);
        }
      }
    } finally {
      sheet.disabled = false;
    }
    for (const [element, roles] of updates) {
      if (!roles) continue;
      if (element.getAttribute(marker) !== roles) element.setAttribute(marker, roles);
      marked.add(element);
    }
    if (walk || pending.size) schedule();
  }

  function stylesLoaded(event) {
    if (event.target.matches?.('link[rel~="stylesheet"]')) schedule(document.documentElement);
  }

  function setPreset(next) {
    if (!Object.hasOwn(palettes, next)) next = undefined;
    if (sheet && next && !document.adoptedStyleSheets.includes(sheet)) {
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
    }
    if (preset === next) return;
    preset = next;
    if (!next) {
      observer.disconnect();
      document.removeEventListener('load', stylesLoaded, true);
      clearTimeout(batchTimer);
      batchTimer = walk = undefined;
      pending.clear();
      document.adoptedStyleSheets = document.adoptedStyleSheets.filter(style => style !== sheet);
      for (const element of marked) element.removeAttribute(marker);
      marked.clear();
      sheet = undefined;
      return;
    }
    if (sheet) {
      sheet.replaceSync(paletteCSS(palettes[next]));
      return;
    }
    sheet = new CSSStyleSheet();
    sheet.replaceSync(paletteCSS(palettes[next]));
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
    observer = new MutationObserver(records => {
      for (const record of records) {
        const target = record.target.nodeType === Node.ELEMENT_NODE ? record.target : record.target.parentElement;
        if (target?.closest('style')) schedule(document.documentElement);
        else if (record.type === 'attributes') schedule(target);
        for (const node of record.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) schedule(node);
        }
        for (const node of record.removedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE || node.isConnected) continue;
          for (const element of [node, ...node.querySelectorAll(`[${marker}]`)]) {
            if (marked.delete(element)) element.removeAttribute(marker);
          }
        }
      }
    });
    observer.observe(document, { subtree: true, childList: true, characterData: true,
      attributes: true, attributeFilter: ['class', 'style', 'hidden', 'open', 'data-theme', 'href'] });
    document.addEventListener('load', stylesLoaded, true);
    schedule(document.documentElement);
  }

  function requestPreset() {
    const request = ++revision;
    void chrome.runtime.sendMessage({ type: 'website-preset' }).then(response => {
      if (request === revision) setPreset(response?.preset);
    }).catch(() => {});
  }

  chrome.runtime.onMessage.addListener((message, sender, reply) => {
    if (sender.id !== chrome.runtime.id || message.type !== 'apply-website-preset') return;
    revision++;
    const previous = preset;
    setPreset(message.preset);
    const root = document.documentElement;
    const applied = !preset || Boolean(root && getComputedStyle(root).backgroundColor === sheet.cssRules[0].style.backgroundColor);
    if (!applied) setPreset(previous);
    reply(applied);
  });
  window.addEventListener('pageshow', event => { if (event.persisted) requestPreset(); });
  requestPreset();
})();
