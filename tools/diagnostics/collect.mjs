// Serialized into an owned tab through CDP. Visible labels are optional; values are never exported.
export function collectPaint(options = {}) {
  const limit = Math.min(1500, options.limit ?? 1500);
  const styles = new Map(), backgrounds = new Map();
  const read = (e, p = '') => {
    if (p) return getComputedStyle(e, p);
    if (!styles.has(e)) styles.set(e, getComputedStyle(e));
    return styles.get(e);
  };
  const rgb = value => {
    const m = /^rgba?\(([^)]+)\)$/.exec(value);
    if (!m) return null;
    const c = m[1].replace(/\//g, ' ').split(/[,\s]+/).filter(Boolean).map(Number);
    if (c.length === 3) c.push(1);
    return c.length === 4 && c.every(Number.isFinite) ? c : null;
  };
  const blend = (a, b) => [...a.slice(0, 3).map((v, i) => v * a[3] + b[i] * (1 - a[3])), 1];
  const parent = e => e.assignedSlot ?? e.parentElement ?? e.getRootNode().host;
  const unknown = reason => ({ color: null, reason });
  const constantWhiteGlyph = e => e instanceof SVGSVGElement && read(e).filter === 'brightness(0) invert(1)' &&
    read(e).backgroundImage === 'none' && rgb(read(e).backgroundColor)?.[3] === 0;
  const backing = (e, depth = 0) => {
    if (!e) return unknown('No explicit opaque canvas backing.');
    if (depth > 48) return unknown('Ancestor limit.');
    if (backgrounds.has(e)) return backgrounds.get(e);
    const s = read(e); let result;
    if ((s.filter !== 'none' && !constantWhiteGlyph(e)) || s.backdropFilter !== 'none' || s.mixBlendMode !== 'normal' || Number(s.opacity) !== 1 || s.maskImage !== 'none') result = unknown('Filter, mask, blending or group opacity.');
    else if (s.backgroundImage !== 'none') result = unknown('Image or gradient backing.');
    else {
      const generated = ['::before', '::after'].some(p => {
        const v = read(e, p), c = rgb(v.backgroundColor);
        return !['none', 'normal'].includes(v.content) && (c?.[3] > 0 || v.backgroundImage !== 'none' || v.maskImage !== 'none');
      });
      const c = rgb(s.backgroundColor);
      if (generated) result = unknown('Generated backing requires geometry analysis.');
      else if (!c) result = unknown('Unsupported CSS color space.');
      else if (c[3] === 1) result = { color: c, reason: 'Opaque CSS backing.', chain: [{ tag: e.localName, color: s.backgroundColor }] };
      else {
        const below = backing(parent(e), depth + 1);
        result = below.color ? { color: blend(c, below.color), reason: 'Composited CSS ancestor backing.', chain: [{ tag: e.localName, color: s.backgroundColor }, ...(below.chain ?? [])] } : below;
      }
    }
    backgrounds.set(e, result); return result;
  };
  // A filter on any ancestor affects foreground as a group, even over an opaque child.
  const effect = e => {
    for (let n = e, d = 0; n && d < 48; n = parent(n), d++) {
      const s = read(n);
      if (Number(s.opacity) !== 1 || (s.filter !== 'none' && !(n === e && constantWhiteGlyph(e))) || s.mixBlendMode !== 'normal' || s.maskImage !== 'none') return 'Ancestor effect prevents solid-paint measurement.';
    }
    return null;
  };
  const locator = e => {
    if (e.dataset.auditId) return `fixture:${e.dataset.auditId}`;
    const parts = [];
    for (let n = e; n; n = n.parentElement) {
      parts.unshift(n.localName + (n.parentElement ? `:nth-child(${Array.prototype.indexOf.call(n.parentElement.children, n) + 1})` : ''));
    }
    const host = e.getRootNode().host;
    return (host ? locator(host) + ' >>> ' : '') + parts.join(' > ');
  };
  const layer = (e, p) => {
    const s = read(e, p);
    const image = s.backgroundImage;
    return { pseudo: p, content: ['none', 'normal', '""'].includes(s.content) ? s.content : '[generated text/glyph]',
      color: s.color, textFill: s.webkitTextFillColor, backgroundColor: s.backgroundColor,
      backgroundImage: image === 'none' ? 'none' : image.includes('gradient(') ? '[gradient]' : '[image]',
      backgroundSize: s.backgroundSize, backgroundPosition: s.backgroundPosition, backgroundRepeat: s.backgroundRepeat,
      fontSize: parseFloat(s.fontSize), fontWeight: s.fontWeight, fontFamily: s.fontFamily,
      opacity: s.opacity, filter: s.filter.includes('url(') ? '[filter resource]' : s.filter, blend: s.mixBlendMode, mask: s.maskImage === 'none' ? 'none' : '[mask]',
      transform: s.transform, position: s.position, width: s.width, height: s.height, display: s.display,
      outline: s.outline, shadow: s.boxShadow, radius: s.borderRadius,
      borders: ['Top', 'Right', 'Bottom', 'Left'].map(side => ({ width: parseFloat(s[`border${side}Width`]), style: s[`border${side}Style`], color: s[`border${side}Color`] })) };
  };
  const rows = []; let skipped = 0, rootCount = 0, uninspectedFrames = 0, visited = 0, walkLimitReached = false;
  const walk = root => {
    rootCount++;
    for (const e of root.querySelectorAll('*')) {
      if (visited++ >= 10000) { walkLimitReached = true; return; }
      if (e.shadowRoot) walk(e.shadowRoot);
      if (e instanceof HTMLIFrameElement) uninspectedFrames++;
      if (e.matches('script,style,link,meta,head,template,noscript')) continue;
      if (options.targeted && !e.hasAttribute('data-audit-id')) continue;
      if (options.selector && !e.matches(options.selector) && !e.closest(options.selector)) continue;
      const r = e.getBoundingClientRect(), s = read(e);
      if (!r.width || !r.height || r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth || s.visibility !== 'visible' || Number(s.opacity) === 0) continue;
      if (rows.length >= limit) { skipped++; continue; }
      const layers = ['', '::before', '::after'].map(p => layer(e, p));
      const reason = effect(e);
      const bg = reason ? unknown(reason) : backing(e);
      const row = { key: locator(e), identity: e.hasAttribute('data-audit-id') ? 'fixture' : 'structural-best-effort',
        signature: `${e.localName}:${e.childElementCount}:${e.getAttribute('role') ?? ''}`,
        tag: e.localName, role: e.getAttribute('role'), disabled: Boolean(e.closest(':disabled,[aria-disabled="true"]')),
        hasText: Array.prototype.some.call(e.childNodes, n => n.nodeType === 3 && n.textContent.trim()),
        bounds: [r.x, r.y, r.width, r.height], backdrop: bg, outside: backing(parent(e)), layers,
        image: e instanceof HTMLImageElement ? { loaded: e.complete && e.naturalWidth > 0, size: [e.naturalWidth, e.naturalHeight], filter: s.filter, pixels: 'not sampled' } : null };
      const landmark = e.closest('nav,main,aside,header,footer,form,[role="dialog"]');
      const label = options.labels ? (e.getAttribute('aria-label') || e.getAttribute('alt') || (e.matches('input,textarea,select') ? '' : e.textContent)).replace(/\s+/g, ' ').trim().slice(0, 100) : '';
      row.location = { label: `${label ? label + ' · ' : ''}${e.localName}${landmark ? ' in ' + landmark.localName : ''} at (${Math.round(r.x)}, ${Math.round(r.y)}) CSS px`,
        selector: row.key, landmark: landmark?.localName ?? null };
      if (e.matches('input[placeholder],textarea[placeholder]') && !e.value) {
        const p = read(e, '::placeholder');
        row.placeholder = Number(p.opacity) === 1 ? p.webkitTextFillColor : null;
      }
      if (e instanceof SVGSVGElement) {
        const paints = [], geometry = [];
        let reason = e.querySelector('svg,use,image,foreignObject') ? 'Nested or externally composed SVG backing.' : null;
        for (const shape of e.querySelectorAll('path,circle,ellipse,line,rect,polygon,polyline')) {
          if (shape.closest('defs,clipPath,mask')) continue;
          const v = read(shape);
          if (v.display === 'none' || v.visibility !== 'visible') continue;
          if (v.filter !== 'none' || Number(v.opacity) !== 1 || v.clipPath !== 'none' || v.maskImage !== 'none') reason = 'Complex SVG shape effect.';
          for (const property of ['fill', 'stroke']) {
            if (property === 'stroke' && parseFloat(v.strokeWidth) === 0) continue;
            if (v[property] !== 'none') {
              if (Number(v[property + 'Opacity']) !== 1) reason = 'Translucent SVG shape.';
              paints.push(v[property]);
            }
          }
          geometry.push([shape.localName, ...['d', 'cx', 'cy', 'r', 'x', 'y', 'width', 'height', 'points'].map(a => shape.getAttribute(a))]);
        }
        row.svg = { paints, geometry, reason };
      }
      rows.push(row);
    }
  };
  walk(document);
  return { rows, coverage: { visibleOnly: true, targeted: Boolean(options.targeted), skipped, rootCount, uninspectedFrames, visited, walkLimitReached,
    closedRoots: 'not inspected', limitations: ['Occlusion, shadows and native popup surfaces need visual review.', 'Artwork pixels and nested SVG backings are not measured in this slice.'] },
    overflow: Math.max(0, document.documentElement.scrollWidth - innerWidth),
    viewport: [innerWidth, innerHeight], dpr: devicePixelRatio, cssZoom: read(document.documentElement).zoom };
}
