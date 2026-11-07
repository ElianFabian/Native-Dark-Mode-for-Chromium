export const LANGUAGES = {
  en: 'English', es: 'Español', fr: 'Français', pt_PT: 'Português',
  it: 'Italiano', zh_CN: '简体中文', ja: '日本語', ko: '한국어', de: 'Deutsch'
};

export function resolveLanguage(choice, browserLanguage) {
  if (choice !== 'auto' && Object.hasOwn(LANGUAGES, choice)) return choice;
  const base = browserLanguage.toLowerCase().replace('_', '-').split('-')[0];
  if (base === 'pt') return 'pt_PT';
  if (base === 'zh') return 'zh_CN';
  return Object.hasOwn(LANGUAGES, base) ? base : 'en';
}

export function formatMessage(key, values, messages, fallback) {
  const template = messages[key]?.message ?? fallback[key]?.message ?? key;
  return template.replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? ''));
}

let messages = {};
let fallback = {};
const cache = new Map();

async function catalog(language) {
  if (!cache.has(language)) {
    cache.set(language, (async () => {
      const response = await fetch(chrome.runtime.getURL(`_locales/${language}/messages.json`));
      if (!response.ok) throw new Error('Could not load interface translations.');
      return response.json();
    })());
  }
  return cache.get(language);
}

export const t = (key, values = {}) => formatMessage(key, values, messages, fallback);

export async function setLanguage(choice, persist = true) {
  const language = resolveLanguage(choice, chrome.i18n.getUILanguage());
  const [english, selected] = await Promise.all([catalog('en'), catalog(language)]);
  if (persist) await chrome.storage.local.set({ uiLanguage: choice });
  fallback = english;
  messages = selected;
  document.documentElement.lang = language.replace('_', '-');
}

export async function initializeLanguage() {
  const stored = (await chrome.storage.local.get('uiLanguage')).uiLanguage;
  const choice = Object.hasOwn(LANGUAGES, stored) ? stored : 'auto';
  await setLanguage(choice, false);
  return choice;
}

export function translatePage() {
  document.querySelectorAll('[data-i18n]').forEach(element => {
    element.textContent = t(element.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-label]').forEach(element => {
    element.setAttribute('aria-label', t(element.dataset.i18nLabel));
  });
  document.title = t(document.documentElement.dataset.page === 'options' ? 'manageRules' : 'title');
  document.querySelector('#import-preview')?.setAttribute('aria-label', t('importPreview'));
}

export function errorText(error) {
  const text = String(error?.message ?? error);
  if (/not valid JSON/.test(text)) return t('errorJson');
  if (/Unsupported backup/.test(text)) return t('errorFormat');
  if (/1 MiB/.test(text)) return t('errorSize');
  if (/1,000 rules/.test(text)) return t('errorLimit');
  if (/duplicate website/.test(text)) return t('errorDuplicate');
  const rule = /^Rule (\d+) is invalid/.exec(text);
  if (rule) return t('errorRule', { count: rule[1] });
  if (/taking too long/.test(text)) return t('errorTimeout');
  if (/already exists for this scope/.test(text)) return t('errorScopeConflict');
  if (/no longer inherits a rule/.test(text)) return t('errorInheritedRuleChanged');
  if (/HTTP or HTTPS/.test(text)) return t('errorPage');
  const detached = /^Connection ended \((.*?)\)/.exec(text);
  if (detached) return t('errorDetached', { reason: detached[1] });
  return text; // Browser-generated diagnostics retain the browser's own wording.
}
