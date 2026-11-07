import { errorText } from './i18n.js';
import { readChoice, writeChoice } from './choices.js';

const scales = [75, 90, 100, 115, 130, 150, 175, 200];
const defaults = { uiTheme: 'system', uiTextScale: 100, uiHighContrast: false };

export async function initializeAppearance() {
  const root = document.documentElement;
  const systemDark = matchMedia('(prefers-color-scheme: dark)');
  const theme = document.querySelector('#ui-theme');
  const contrast = document.querySelector('#high-contrast');
  const smaller = document.querySelector('#text-smaller');
  const larger = document.querySelector('#text-larger');
  const output = document.querySelector('#text-scale');
  const sizeControls = output.parentElement;
  const sizeSlot = sizeControls.parentElement;
  const status = document.querySelector('#appearance-status');
  const preferences = { ...defaults };

  function render() {
    const { uiTheme, uiTextScale, uiHighContrast } = preferences;
    writeChoice(theme, uiTheme);
    const selectedTheme = readChoice(theme);
    root.dataset.theme = selectedTheme === 'system' ? (systemDark.matches ? 'dark' : 'light') : selectedTheme;
    contrast.checked = uiHighContrast === true;
    root.toggleAttribute('data-high-contrast', contrast.checked);
    const scale = scales.includes(uiTextScale) ? uiTextScale : defaults.uiTextScale;
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
    const index = scales.indexOf(preferences.uiTextScale);
    const next = scales[(index === -1 ? scales.indexOf(defaults.uiTextScale) : index) + direction];
    if (next !== undefined) void save('uiTextScale', next);
  }

  function pinSizeControls(event) {
    if (event.pointerType !== 'mouse' || sizeControls.hasAttribute('data-pinned')) return;
    const bounds = sizeControls.getBoundingClientRect();
    const fontSize = getComputedStyle(sizeControls).fontSize;
    if (root.dataset.page !== 'options') {
      root.style.setProperty('--popup-width', getComputedStyle(document.body).width);
    }
    sizeSlot.style.minBlockSize = `${bounds.height}px`;
    Object.assign(sizeControls.style, {
      top: `${bounds.top}px`,
      left: `${bounds.left}px`,
      width: `${bounds.width}px`,
      fontSize
    });
    sizeControls.setAttribute('data-pinned', '');
  }

  function unpinSizeControls() {
    sizeControls.removeAttribute('data-pinned');
    sizeControls.removeAttribute('style');
    sizeSlot.style.removeProperty('min-block-size');
    root.style.removeProperty('--popup-width');
  }

  render();
  try {
    Object.assign(preferences, await chrome.storage.local.get(defaults));
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
  smaller.addEventListener('pointerdown', pinSizeControls);
  larger.addEventListener('pointerdown', pinSizeControls);
  sizeControls.addEventListener('pointerleave', unpinSizeControls);
  window.addEventListener('blur', unpinSizeControls);
  smaller.addEventListener('click', () => step(-1));
  larger.addEventListener('click', () => step(1));
  return render;
}
