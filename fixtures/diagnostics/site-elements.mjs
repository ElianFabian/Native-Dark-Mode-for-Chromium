const selected = new URLSearchParams(location.search).get('site');
for (const section of document.querySelectorAll('[data-site]')) if (selected) section.hidden = section.dataset.site !== selected;
if (selected) document.documentElement.dataset.single = selected;
const allowed = new Set(['indeed-logo.svg', 'indeed-bookmark.svg', 'indeed-messages.svg', 'indeed-bell.svg', 'indeed-pay.svg', 'indeed-commute.svg']);
await Promise.all([...document.querySelectorAll('[data-svg]')].map(async (host, index) => {
  if (!allowed.has(host.dataset.svg)) throw Error('Unknown local SVG');
  const response = await fetch('site-assets/' + host.dataset.svg);
  if (!response.ok) throw Error('Missing local SVG');
  const svg = new DOMParser().parseFromString(await response.text(), 'image/svg+xml').documentElement;
  if (svg.localName !== 'svg' || svg.querySelector('script,foreignObject,parsererror')) throw Error('Unexpected SVG content');
  for (const e of [svg, ...svg.querySelectorAll('*')]) for (const attribute of e.attributes) if (/^on/i.test(attribute.name) || /^(?:href|src)$/i.test(attribute.localName) && !attribute.value.startsWith('#')) throw Error('Active SVG content');
  svg.dataset.auditId = 'site-inline-' + index; host.append(document.importNode(svg, true));
}));
document.querySelectorAll('a').forEach(link => link.addEventListener('click', e => e.preventDefault()));
document.documentElement.dataset.fixtureReady = 'yes';
