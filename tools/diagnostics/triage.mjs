// Deterministic prioritization, separate from measurement and renderer policy.
import { analyze } from './analysis.mjs';

export const TRIAGE_POLICY = 'source-aware-1';
// Compact non-security key for local review annotations, never a trust decision.
function key(value) {
  const text = JSON.stringify(value); let a = 2166136261, b = 5381;
  for (let i = 0; i < text.length; i++) { a = Math.imul(a ^ text.charCodeAt(i), 16777619); b = Math.imul(b, 33) ^ text.charCodeAt(i); }
  return `${(a >>> 0).toString(16)}-${(b >>> 0).toString(16)}-${text.length}`;
}
export function triage(report, analysis = analyze(report), reviews = []) {
  const scope = report.runId ?? key(report);
  const captures = new Map(report.captures.map(c => [c.id, { ...c, nodes: new Map(c.rows.map(r => [r.key, r])) }]));
  const checks = new Map(analysis.checks.map(c => [c.id, c]));
  const groups = new Map();
  const counts = { pass: 0, review: 0, unsupported: 0, unstable: 0, 'not-applicable': 0 };
  for (const check of analysis.checks) {
    counts[check.status] = (counts[check.status] ?? 0) + 1;
    const capture = captures.get(check.capture);
    if (capture.theme === 'source' || !['review', 'unstable'].includes(check.status)) continue;
    const row = capture.nodes.get(check.element);
    const source = captures.get(capture.sourceId);
    const original = source?.nodes.get(row.key);
    const matched = Boolean(original && typeof row.signature === 'string' && original.signature === row.signature);
    const layer = check.kind === 'border' ? check.layer.split(':').slice(0, -1).join(':') : check.layer;
    const id = JSON.stringify([capture.specimen ?? 'page', row.key, check.kind, layer, capture.state, capture.scale]);
    let priority = 'advisory', reason;
    if (check.status === 'unstable' || source?.settled === false) { priority = 'candidate'; reason = 'Paint did not settle; repeat capture before interpreting colors.'; }
    else if (!matched && capture.sourceId) reason = 'Authored element identity could not be matched; inspect before attributing this to the theme.';
    else if (check.kind === 'border') {
      if (check.evidence.widthChanged || check.evidence.exposed) { priority = 'high'; reason = 'Border geometry changed or reserved transparency became visible.'; }
      else reason = 'Off border is more conspicuous than its authored edge; visual review, not a thickness failure.';
    } else if (check.kind === 'geometry') { priority = 'high'; reason = 'Measured width or height changed; text reflow may be intentional.'; }
    else {
      const sourceCheck = source && checks.get(JSON.stringify([source.id, row.key, check.kind, check.layer]));
      if (matched && sourceCheck?.status === 'pass') { priority = 'candidate'; reason = 'Readable authored paint dropped below the numeric reference after theming.'; }
      else if (matched && Number.isFinite(sourceCheck?.value) && check.value < sourceCheck.value - .25) { priority = 'candidate'; reason = 'Already-low measured contrast decreased further after theming.'; }
      else reason = 'Below the numeric reference, but no measured degradation from the original. Review only; appearance may be acceptable.';
    }
    let group = groups.get(id);
    if (!group) {
      const position = row.bounds.slice(0, 2).map(Math.round).join(', ');
      group = { id, priority, reason, kind: check.kind, element: row.key, layer, state: capture.state, scale: capture.scale,
        location: row.location?.label || `${row.tag ?? 'element'} at (${position}) CSS px`,
        locator: row.location?.selector ?? row.key, bounds: row.bounds, representative: check.id, checks: [], themes: [], levels: [], values: [], evidence: [] };
      groups.set(id, group);
    }
    if (['high', 'candidate', 'advisory'].indexOf(priority) < ['high', 'candidate', 'advisory'].indexOf(group.priority)) { group.priority = priority; group.reason = reason; group.representative = check.id; }
    group.checks.push(check.id); group.themes.push(check.theme); group.levels.push(check.level);
    if (check.value !== null) group.values.push(check.value);
    // Exact measured facts scope an acceptance to this report and these paints.
    group.evidence.push([check.id, check.value, check.evidence, row.signature, row.backdrop, row.layers, row.svg ?? null]);
  }
  const accepted = new Set(reviews.filter(r => r?.disposition === 'accepted').map(r => r.fingerprint));
  const findings = [...groups.values()].map(group => {
    group.themes = [...new Set(group.themes)].sort(); group.levels = [...new Set(group.levels)].sort();
    group.range = group.values.length ? [Math.min(...group.values), Math.max(...group.values)] : null;
    group.fingerprint = key([TRIAGE_POLICY, scope, group.id, group.evidence]);
    delete group.values; delete group.evidence;
    group.disposition = accepted.has(group.fingerprint) ? 'accepted' : 'open';
    return group;
  }).sort((a, b) => ['high', 'candidate', 'advisory'].indexOf(a.priority) - ['high', 'candidate', 'advisory'].indexOf(b.priority) || a.id.localeCompare(b.id));
  return { format: 'native-dark-triage', version: 1, policy: TRIAGE_POLICY, counts, findings,
    failedAssertions: report.assertions?.filter(a => !a.passed).map(a => a.id) ?? [],
    limitations: 'Priority is a reproducible heuristic, not a confirmed rendering defect. Unsupported measurements remain unknown. Live node identity is best-effort. Acceptances apply to this report and exact captured facts.' };
}

export function summaryMarkdown(result) {
  const open = result.findings.filter(f => f.disposition !== 'accepted');
  const lines = ['# Diagnostic review queue', '', `Policy: ${result.policy}. ${open.length} grouped findings; ${result.counts.unsupported} unsupported measurements; ${result.failedAssertions.length} failed fixture assertions.`, '', result.limitations, ''];
  for (const finding of open) lines.push(`- **${finding.priority} · ${finding.kind}**: ${finding.location} (${finding.themes.join(', ')}; ${finding.levels.join(', ')}). ${finding.reason}`, `  Locator: \`${finding.locator}\``, '');
  return lines.join('\n');
}
