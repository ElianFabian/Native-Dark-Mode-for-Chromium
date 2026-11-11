const sections = [...document.querySelectorAll('[data-group]')];
const selected = new URLSearchParams(location.search).get('group');
for (const section of sections) {
  const group = section.dataset.group;
  const link = document.createElement('a'); link.href = '?group=' + group; link.textContent = section.querySelector('h2').textContent; document.querySelector('#groups').append(link);
  section.id = group;
  if (selected) section.hidden = group !== selected;
}
if (selected) document.documentElement.dataset.single = selected;
// Capture actual SVG roots as well as their semantic control wrappers.
document.querySelectorAll('svg').forEach((svg, index) => { svg.dataset.auditId ||= `svg-ink-${index}`; });
let slide = 0;
function move(delta) {
  slide = (slide + delta + 3) % 3;
  document.querySelector('.track').style.transform = `translateX(${-slide * 286}px)`;
  for (const [index, button] of [...document.querySelectorAll('.dots button')].entries()) button.setAttribute('aria-current', String(index === slide));
}
document.querySelector('#previous').onclick = () => move(-1);
document.querySelector('#next').onclick = () => move(1);
document.querySelectorAll('.dots button').forEach((button, index) => { button.onclick = () => move(index - slide); });
document.documentElement.dataset.fixtureReady = 'yes';
