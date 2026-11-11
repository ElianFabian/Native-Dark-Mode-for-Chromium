// Independent diagnostics: do not import renderer classifiers or replacement colors.
export const SCHEMA = 1;
export const POLICY = 'solid-paint-1';
export function color(value) {
  if (typeof value !== 'string') return null;
  const hex = /^#([\da-f]{6})$/i.exec(value);
  if (hex) return [0, 2, 4].map(i => parseInt(hex[1].slice(i, i + 2), 16)).concat(1);
  const rgb = /^rgba?\(([^)]+)\)$/.exec(value);
  const srgb = /^color\(srgb ([^)]+)\)$/.exec(value);
  if (!rgb && !srgb) return null;
  const parts = (rgb?.[1] ?? srgb[1]).replace(/\//g, ' ').split(/[,\s]+/).filter(Boolean);
  if (parts.length < 3 || parts.length > 4) return null;
  const channels = parts.map((part, i) => part.endsWith('%') ? parseFloat(part) / 100 * (i < 3 && rgb ? 255 : 1) : Number(part));
  if (srgb) for (let i = 0; i < 3; i++) channels[i] *= 255;
  if (channels.length === 3) channels.push(1);
  return channels.every((v, i) => Number.isFinite(v) && v >= 0 && v <= (i < 3 ? 255 : 1)) ? channels : null;
}
export function composite(front, back) {
  const alpha = front[3] + back[3] * (1 - front[3]);
  return [...front.slice(0, 3).map((v, i) => alpha ? (v * front[3] + back[i] * back[3] * (1 - front[3])) / alpha : 0), alpha];
}
export function luminance(c) {
  return c.slice(0, 3).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4)
    .reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
}
export function contrast(ink, backing) {
  if (!ink || !backing || backing[3] !== 1) return null;
  const a = luminance(composite(ink, backing)), b = luminance(backing);
  return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
}
export function validateReport(report) {
  if (report?.format !== 'native-dark-diagnostics' || report.version !== SCHEMA || !Array.isArray(report.captures) || report.captures.length > 1000) throw Error('Unsupported diagnostic report.');
  const captureIds = new Set();
  for (const capture of report.captures) {
    if (typeof capture.id !== 'string' || captureIds.has(capture.id) || !Array.isArray(capture.rows) || capture.rows.length > 5000) throw Error('Invalid capture.');
    captureIds.add(capture.id);
    const keys = new Set();
    for (const row of capture.rows) {
      if (typeof row.key !== 'string' || keys.has(row.key) || !Array.isArray(row.layers) || row.layers.length !== 3 || !Array.isArray(row.bounds) || row.bounds.length !== 4 || !row.bounds.every(Number.isFinite) || !row.backdrop || !row.outside) throw Error('Invalid or duplicate element record.');
      keys.add(row.key);
      for (const layer of row.layers) if (!Array.isArray(layer.borders) || layer.borders.length !== 4) throw Error('Invalid paint layer.');
    }
  }
  return report;
}
function backdrop(row, layer) {
  if (layer === row.layers[0]) return row.backdrop;
  const base = row.backdrop;
  if (!base.color || layer.backgroundImage !== 'none' || layer.filter !== 'none' || layer.mask !== 'none' || Number(layer.opacity) !== 1) return { color: null, reason: 'Complex generated layer.' };
  const paint = color(layer.backgroundColor);
  return paint ? { color: composite(paint, base.color), reason: 'Known generated-layer backing.' } : { color: null, reason: 'Unsupported generated color.' };
}
export function analyze(report) {
  validateReport(report);
  const captures = new Map(report.captures.map(c => [c.id, c]));
  const checks = [];
  for (const capture of report.captures) {
    const original = new Map((captures.get(capture.sourceId)?.rows ?? []).map(r => [r.key, r]));
    const add = (row, kind, layer, status, value, target, evidence) => checks.push({
      id: JSON.stringify([capture.id, row.key, kind, layer]), capture: capture.id, element: row.key, kind, layer,
      theme: capture.theme, level: capture.level, state: capture.state, scale: capture.scale,
      status: capture.settled === false ? 'unstable' : status, value, target, evidence
    });
    for (const row of capture.rows) {
      const source = original.get(row.key);
      const textLayer = row.layers[0];
      for (const layer of row.layers) {
        if (layer.pseudo && ['none', 'normal'].includes(layer.content)) continue;
        const bg = backdrop(row, layer);
        if (!layer.pseudo && row.hasText) {
          const target = Number(layer.fontSize) >= 24 || (Number(layer.fontSize) >= 18.666666 && Number(layer.fontWeight) >= 700) ? 3 : 4.5;
          const measured = contrast(color(layer.textFill), bg.color);
          const hiddenLabel = Number(layer.fontSize) === 0;
          add(row, 'text', '', row.disabled || hiddenLabel ? 'not-applicable' : measured === null ? 'unsupported' : measured >= target ? 'pass' : 'review', measured, hiddenLabel ? null : target,
            hiddenLabel ? 'Zero-sized text label; the visible marker needs a separate paint check.' : bg.reason);
        }
        for (let side = 0; side < 4; side++) {
          const edge = layer.borders[side];
          if (!(edge.width > 0) || ['none', 'hidden'].includes(edge.style)) continue;
          const ink = color(edge.color), measured = contrast(ink, bg.color);
          const before = source?.layers.find(l => l.pseudo === layer.pseudo)?.borders[side];
          const oldBg = source && backdrop(source, source.layers.find(l => l.pseudo === layer.pseudo));
          const oldRatio = before && contrast(color(before.color), oldBg?.color);
          const amplified = capture.level === 'off' && oldRatio !== null && oldRatio !== undefined && oldRatio <= 1.8 && measured > 2;
          const widthChanged = before && Math.abs(before.width - edge.width) > .02;
          const exposed = before && color(before.color)?.[3] === 0 && ink?.[3] > 0;
          add(row, 'border', `${layer.pseudo}:${side}`, widthChanged || exposed || amplified ? 'review' : measured === null ? 'unsupported' : 'pass', measured, null,
            { width: edge.width, originalWidth: before?.width ?? null, originalContrast: oldRatio ?? null, widthChanged: Boolean(widthChanged), exposed: Boolean(exposed), amplified,
              inside: bg.reason, outsideContrast: contrast(ink, row.outside?.color), note: 'No universal minimum for decorative edges.' });
        }
      }
      if (row.svg) {
        const whiteFilter = row.layers[0].filter === 'brightness(0) invert(1)';
        const paints = row.svg.paints.map(color).map(c => c && whiteFilter ? [255, 255, 255, c[3]] : c);
        const sameInk = paints.length && paints.every(c => c && c.every((v, i) => v === paints[0]?.[i]));
        const measured = !row.svg.reason && sameInk ? contrast(paints[0], row.backdrop.color) : null;
        add(row, 'svg', '', row.disabled ? 'not-applicable' : measured === null ? 'unsupported' : measured >= 3 ? 'pass' : 'review', measured, 3,
          { reason: row.svg.reason || (sameInk ? row.backdrop.reason : 'Multiple visible inks; needs per-shape backing analysis.'),
            rawPaints: row.svg.paints, effectivePaints: paints, model: whiteFilter ? 'CSS brightness(0) invert(1), alpha preserved' : 'Computed shape ink' });
      }
      if (row.placeholder) {
        const measured = contrast(color(row.placeholder), row.backdrop.color);
        add(row, 'placeholder', '', row.disabled ? 'not-applicable' : measured === null ? 'unsupported' : measured >= 4.5 ? 'pass' : 'review', measured, 4.5, row.backdrop.reason);
      }
      if (source) {
        const delta = Math.max(...row.bounds.slice(2).map((v, i) => Math.abs(v - source.bounds[i + 2])));
        add(row, 'geometry', '', delta > .05 ? 'review' : 'pass', delta, .05, 'Width/height delta in CSS px; text reflow can be intentional.');
      }
      if (row.image || textLayer.backgroundImage !== 'none') add(row, 'artwork', '', 'unsupported', null, null, 'Source URLs/pixels omitted. Filtered or layered artwork needs targeted pixel evidence.');
    }
  }
  return { format: 'native-dark-analysis', version: SCHEMA, policy: POLICY, checks: checks.sort((a, b) => a.id.localeCompare(b.id)) };
}
export function compare(before, after) {
  const a = analyze(before), b = analyze(after);
  const fields = ['browser', 'platform', 'viewport', 'deviceScaleFactor', 'cssZoom', 'fixtureHash'];
  const drift = fields.filter(k => JSON.stringify(before.environment?.[k]) !== JSON.stringify(after.environment?.[k]));
  const old = new Map(a.checks.map(c => [c.id, c]));
  const nodes = new Map(before.captures.flatMap(c => c.rows.map(r => [JSON.stringify([c.id, r.key]), r.signature])));
  const changedNodes = new Set(after.captures.flatMap(c => c.rows.filter(r => nodes.has(JSON.stringify([c.id, r.key])) && nodes.get(JSON.stringify([c.id, r.key])) !== r.signature).map(r => JSON.stringify([c.id, r.key]))));
  const uncertainNodes = new Set(after.captures.flatMap(c => c.rows.filter(r => r.identity !== 'fixture').map(r => JSON.stringify([c.id, r.key]))));
  const changes = b.checks.map(current => {
    const previous = old.get(current.id); old.delete(current.id);
    const uncertain = drift.length || changedNodes.has(JSON.stringify([current.capture, current.element])) || uncertainNodes.has(JSON.stringify([current.capture, current.element]));
    let status = !previous ? 'new' : uncertain ? 'not-comparable' : current.status === previous.status ? (JSON.stringify(current) === JSON.stringify(previous) ? 'unchanged' : 'changed') :
      previous.status === 'review' && current.status === 'pass' ? 'resolved' : previous.status === 'pass' && current.status === 'review' ? 'regressed' : 'changed';
    if (previous && !uncertain && previous.status === 'review' && current.status === 'review' && current.value !== null && previous.value !== null && current.value !== previous.value && ['text', 'svg', 'placeholder'].includes(current.kind)) status = current.value > previous.value ? 'improved' : 'worsened';
    return { id: current.id, status, previous: previous ?? null, current };
  });
  for (const previous of old.values()) changes.push({ id: previous.id, status: 'missing', previous, current: null });
  return { format: 'native-dark-comparison', version: SCHEMA, policy: POLICY, environmentDrift: drift, changes: changes.sort((a, b) => a.id.localeCompare(b.id)) };
}
