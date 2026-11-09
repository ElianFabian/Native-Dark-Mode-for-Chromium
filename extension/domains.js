import { ICANN_SUFFIXES } from './icann-suffixes.js';

const suffixes = new Set(ICANN_SUFFIXES.split('\n'));

export function regionalDomain(hostname) {
  const labels = hostname.toLowerCase().replace(/\.$/, '').split('.');
  if (labels.some(label => !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))) return undefined;

  let suffixStart = labels.length;
  for (let index = 0; index < labels.length; index++) {
    const suffix = labels.slice(index).join('.');
    if (suffixes.has(`!${suffix}`)) {
      suffixStart = index + 1;
      break;
    }
    const wildcard = `*.${labels.slice(index + 1).join('.')}`;
    if (suffixes.has(suffix) || suffixes.has(wildcard)) suffixStart = Math.min(suffixStart, index);
  }

  if (suffixStart === 0 || suffixStart === labels.length) return undefined;
  const nameIndex = suffixStart - 1;
  return {
    name: labels[nameIndex],
    domain: labels.slice(nameIndex).join('.'),
    subdomain: labels.slice(0, nameIndex).join('.')
  };
}

export function regionalBaseForHost(host) {
  const site = regionalDomain(host);
  if (site?.subdomain === 'www') return { ...site, subdomain: '' };
  return site;
}
