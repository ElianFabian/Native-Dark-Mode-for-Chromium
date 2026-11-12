// Lab-only guidance. Keep action descriptions separate from diagnostic policy.
const descriptions = {
  '#run': 'Capture a small set of local cases and check their automated expectations in an isolated browser. This is a quick smoke check, not the complete project test suite.',
  '#run-gallery': 'Capture the extended local cases in the original design and all three custom themes at Off and Maximum. Measurements and screenshots support review; a successful capture does not mean every case looks correct.',
  '[data-tab="gallery"]': 'Browse and search local reproductions. Previews show the original design unless a website theme is enabled for this local address.',
  '[data-tab="report"]': 'Open a saved capture and inspect potential problems, screenshots, colors, borders and original versus themed measurements.',
  '[data-tab="compare"]': 'Compare capture.json files from before and after a change. Differences in browser settings or page structure can make results incomparable.',
  '#case-search': 'Filter the local examples by website, case name or mechanism, such as icons, GIFs or borders.',
  '#coverage-count': 'See which reported mechanisms have local reproductions and which remain pending. A listed case is not automatically a passing test.',
  '#runs': 'Choose a capture saved by this local server. Its measurements and any available screenshots open below.',
  '#refresh': 'Refresh the saved-run list. This does not capture the pages again.',
  '#file': 'Open a capture.json report from disk. This reads saved evidence; it does not run page scripts or make a new capture.',
  '#queue-filter': 'Start with priority candidates, show all open findings including numerical advisories, or revisit appearances you accepted. Findings require review; they are not confirmed defects.',
  '#export-reviews': 'Download your appearance-review decisions as JSON. This exports decisions, not capture data or extension rules.',
  '#import-reviews': 'Merge previously exported appearance-review decisions. Changed measurements or a fresh capture require a new review.',
  '#raw-filters': 'Explore individual measurements behind the grouped review queue. Unsupported or unstable results are unknown, not passing checks.',
  '#theme': 'Filter measurements: source is the original design, chromium is Simulated Native, soft is Soft dark, and contrast is High contrast. This does not change the page theme.',
  '#level': 'Filter the border-emphasis level recorded in the capture. This does not change the saved measurements or extension settings.',
  '#status': 'Filter measured results. Review means inspect the evidence; unsupported means the paint cannot be evaluated, and unstable means it did not settle.',
  '#kind': 'Filter text, SVG, border, layout geometry, artwork or placeholder measurements.',
  '#metric': 'Choose the numeric field used by the Minimum and Maximum filters. Contrast, width and geometry delta use different units.',
  '#minimum': 'Show measurements at or above this value for the selected numeric field. Leave empty for no lower limit.',
  '#maximum': 'Show measurements at or below this value for the selected numeric field. Leave empty for no upper limit.',
  '#search': 'Filter measurements by recorded element or case. Live visible labels are only included when explicitly requested during capture.',
  '#before': 'Choose the earlier capture.json file as the comparison baseline.',
  '#after': 'Choose the later capture.json file to compare with the baseline.',
  '#diff': 'Analyze both selected files with the same current policy and list changes, improvements and regressions. This does not make new browser captures.'
};

export function setHelp(element, text) {
  element.dataset.help = text;
  // Available to assistive technology even before the visual tooltip opens.
  element.setAttribute('aria-description', text);
  return element;
}

export function installHelp() {
  for (const [selector, text] of Object.entries(descriptions)) {
    const element = document.querySelector(selector);
    if (element) setHelp(element, text);
  }
  const tooltip = document.createElement('div');
  tooltip.id = 'lab-help'; tooltip.className = 'help-tooltip';
  tooltip.setAttribute('role', 'tooltip'); tooltip.hidden = true;
  document.body.append(tooltip);
  let trigger, timer, closeTimer;
  function hide() {
    clearTimeout(timer); clearTimeout(closeTimer);
    if (trigger) {
      const ids = (trigger.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(id => id && id !== tooltip.id);
      if (ids.length) trigger.setAttribute('aria-describedby', ids.join(' '));
      else trigger.removeAttribute('aria-describedby');
    }
    trigger = undefined; tooltip.hidden = true;
  }
  function position() {
    if (!trigger || tooltip.hidden) return;
    const rect = trigger.getBoundingClientRect(), box = tooltip.getBoundingClientRect();
    tooltip.style.left = Math.max(12, Math.min(rect.left, innerWidth - box.width - 12)) + 'px';
    const below = rect.bottom + 8;
    tooltip.style.top = Math.max(12, below + box.height <= innerHeight - 12 ? below : rect.top - box.height - 8) + 'px';
  }
  function show(element, delay = 0) {
    clearTimeout(closeTimer);
    if (trigger === element && (!tooltip.hidden || timer)) return;
    hide(); trigger = element;
    const open = () => {
      timer = undefined;
      if (!element.isConnected || trigger !== element) return hide();
      tooltip.textContent = element.dataset.help; tooltip.hidden = false;
      const ids = new Set((element.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean));
      ids.add(tooltip.id); element.setAttribute('aria-describedby', [...ids].join(' ')); position();
    };
    if (delay) timer = setTimeout(open, delay); else open();
  }
  document.addEventListener('pointerover', event => {
    if (event.pointerType === 'touch') return;
    if (tooltip.contains(event.target)) { clearTimeout(closeTimer); return; }
    const element = event.target.closest('[data-help]');
    if (element) show(element, 800);
  });
  document.addEventListener('pointerout', event => {
    if (!trigger || trigger === document.activeElement || trigger.contains(event.relatedTarget) || tooltip.contains(event.relatedTarget)) return;
    clearTimeout(timer); timer = undefined;
    closeTimer = setTimeout(hide, 150);
  });
  document.addEventListener('focusin', event => {
    const element = event.target.closest('[data-help]');
    if (element) { clearTimeout(timer); timer = undefined; show(element); }
    else hide();
  });
  document.addEventListener('focusout', hide);
  document.addEventListener('keydown', event => { if (event.key === 'Escape') hide(); });
  document.addEventListener('click', hide);
  document.addEventListener('scroll', () => {
    // Focusing an offscreen control scrolls it into view after focusin. Keep
    // keyboard guidance anchored instead of dismissing that automatic scroll.
    const rect = trigger?.getBoundingClientRect();
    if (trigger === document.activeElement && rect?.bottom > 0 && rect.top < innerHeight) position();
    else hide();
  }, true);
  window.addEventListener('resize', position);
}
