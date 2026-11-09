import { errorText } from './i18n.js';
import { readChoice, writeChoice } from './choices.js';

const scales = [75, 90, 100, 115, 130, 150, 175, 200];
const defaultScale = 100;

export async function initializeAppearance() {
  const root = document.documentElement;
  const scaleKey = root.dataset.page === 'options' ? 'uiManagerTextScale' : 'uiPopupTextScale';
  const defaults = { uiTheme: 'system', [scaleKey]: defaultScale, uiHighContrast: false };
  const systemDark = matchMedia('(prefers-color-scheme: dark)');
  const theme = document.querySelector('#ui-theme');
  const contrast = document.querySelector('#high-contrast');
  const smaller = document.querySelector('#text-smaller');
  const larger = document.querySelector('#text-larger');
  const output = document.querySelector('#text-scale');
  const status = document.querySelector('#appearance-status');
  const preferences = { ...defaults };

  function render() {
    const { uiTheme, uiHighContrast } = preferences;
    writeChoice(theme, uiTheme);
    const selectedTheme = readChoice(theme);
    root.dataset.theme = selectedTheme === 'system' ? (systemDark.matches ? 'dark' : 'light') : selectedTheme;
    contrast.checked = uiHighContrast === true;
    root.toggleAttribute('data-high-contrast', contrast.checked);
    const storedScale = preferences[scaleKey];
    const scale = scales.includes(storedScale) ? storedScale : defaultScale;
    root.style.fontSize = `${scale}%`;
    output.value = new Intl.NumberFormat(document.documentElement.lang, { style: 'percent' }).format(scale / 100);
    smaller.setAttribute('aria-disabled', String(scale === scales[0]));
    larger.setAttribute('aria-disabled', String(scale === scales.at(-1)));
  }

  async function save(key, value) {
    const previous = preferences[key];
    preferences[key] = value;
    render();
    try {
      await chrome.storage.local.set({ [key]: value });
      status.textContent = '';
    } catch (error) {
      if (preferences[key] === value) preferences[key] = previous;
      render();
      status.textContent = errorText(error);
    }
  }

  function step(direction) {
    const index = scales.indexOf(preferences[scaleKey]);
    const next = scales[(index === -1 ? scales.indexOf(defaultScale) : index) + direction];
    if (next !== undefined) void save(scaleKey, next);
  }

  render();
  try {
    const { uiTextScale, ...stored } = await chrome.storage.local.get([...Object.keys(defaults), 'uiTextScale']);
    Object.assign(preferences, stored);
    if (stored[scaleKey] === undefined && scales.includes(uiTextScale)) preferences[scaleKey] = uiTextScale;
  } catch (error) {
    status.textContent = errorText(error);
  }
  render();
  systemDark.addEventListener('change', render);
  chrome.storage.local.onChanged.addListener(changes => {
    if (!Object.keys(defaults).some(key => changes[key])) return;
    for (const key of Object.keys(defaults)) {
      if (changes[key]) preferences[key] = changes[key].newValue ?? defaults[key];
    }
    render();
  });
  theme.addEventListener('change', () => save('uiTheme', readChoice(theme)));
  contrast.addEventListener('change', () => save('uiHighContrast', contrast.checked));
  smaller.addEventListener('click', () => step(-1));
  larger.addEventListener('click', () => step(1));
  return render;
}
