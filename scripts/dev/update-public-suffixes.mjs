import { readFileSync, writeFileSync } from 'node:fs';
import { domainToASCII } from 'node:url';

const source = process.argv[2];
if (!source) throw new Error('Pass a copy of https://publicsuffix.org/list/public_suffix_list.dat');
const data = readFileSync(source, 'utf8');
const section = data.split('// ===BEGIN ICANN DOMAINS===')[1]?.split('// ===END ICANN DOMAINS===')[0];
if (!section) throw new Error('Missing ICANN section in the Public Suffix List.');
const entries = section.split(/\r?\n/).map(line => line.split('//')[0].trim()).filter(Boolean).map(line => {
  const prefix = line.startsWith('!') ? '!' : line.startsWith('*.') ? '*.' : '';
  const domain = domainToASCII(line.slice(prefix.length));
  if (!/^[a-z0-9.-]+$/.test(domain)) throw new Error(`Invalid suffix: ${line}`);
  return prefix + domain;
});
const version = data.match(/^\/\/ VERSION: ([\w-]+)$/m)?.[1] ?? 'unknown';
writeFileSync(new URL('../../extension/icann-suffixes.js', import.meta.url),
  `// This Source Code Form is subject to the terms of the Mozilla Public\n` +
  `// License, v. 2.0. If a copy of the MPL was not distributed with this\n` +
  `// file, You can obtain one at https://mozilla.org/MPL/2.0/.\n` +
  `// Generated from the ICANN section of https://publicsuffix.org/list/public_suffix_list.dat\n` +
  `// Version: ${version}\nexport const ICANN_SUFFIXES = \`${entries.join('\n')}\`;\n`);
