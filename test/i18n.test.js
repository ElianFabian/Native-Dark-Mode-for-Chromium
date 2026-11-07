import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LANGUAGES, resolveLanguage, formatMessage } from '../extension/i18n.js';

const catalog = language => JSON.parse(readFileSync(new URL(`../extension/_locales/${language}/messages.json`, import.meta.url), 'utf8'));

test('automatic language handles variants and a manual choice takes priority', () => {
  assert.equal(resolveLanguage('auto', 'es-ES'), 'es');
  assert.equal(resolveLanguage('auto', 'fr-CA'), 'fr');
  assert.equal(resolveLanguage('auto', 'pt-BR'), 'pt_PT');
  assert.equal(resolveLanguage('auto', 'zh-TW'), 'zh_CN');
  assert.equal(resolveLanguage('auto', 'nl-NL'), 'en');
  assert.equal(resolveLanguage('ja', 'es-ES'), 'ja');
});

test('each supported language has all popup and manifest messages with matching variables', () => {
  const english = catalog('en');
  const popup = readFileSync(new URL('../extension/popup.html', import.meta.url), 'utf8');
  const options = readFileSync(new URL('../extension/options.html', import.meta.url), 'utf8');
  const manifest = readFileSync(new URL('../extension/manifest.json', import.meta.url), 'utf8');
  for (const [, key] of [...(popup + options).matchAll(/data-i18n="(\w+)"/g), ...manifest.matchAll(/__MSG_(\w+)__/g)]) {
    assert.ok(english[key], `Missing UI message ${key}`);
  }
  const variables = message => [...message.matchAll(/\{\w+\}/g)].map(match => match[0]).sort();
  for (const language of Object.keys(LANGUAGES)) {
    const messages = catalog(language);
    for (const [key, entry] of Object.entries(english)) {
      assert.ok(messages[key]?.message, `${language} is missing ${key}`);
      assert.deepEqual(variables(messages[key].message), variables(entry.message), `${language}/${key} variables`);
    }
    assert.match(formatMessage('scopeRegional', { scope: 'amazon.es' }, messages, english), /amazon\.es/);
  }
});
