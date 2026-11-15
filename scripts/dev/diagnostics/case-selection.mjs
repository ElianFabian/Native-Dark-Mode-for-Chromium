import { readFileSync } from 'node:fs';
import { sharedCaseUnits } from '../../../tools/diagnostics/shared-cases.mjs';

export const renderingGroups = ['icons', 'borders', 'images', 'surfaces', 'states', 'contact', 'cards'];
const inventory = JSON.parse(readFileSync(new URL('../../../tools/diagnostics/shared-case-inventory.json', import.meta.url), 'utf8')).cases;
export { sharedCaseUnits };

function entries(value, valid, label) {
  const ids = typeof value === 'string' ? value.split(',') : [];
  if (!ids.length || ids.some(id => !id || !valid.includes(id)) || new Set(ids).size !== ids.length) {
    throw Error(`Invalid ${label}: use distinct known IDs. ${label === 'groups' ? 'Use --focus '+renderingGroups.join(',')+' with verify (--groups in the shared runner). ' : ''}Use --list-cases to inspect cases and companions.`);
  }
  return ids;
}

export function selectRenderingCases({ cases, groups } = {}) {
  if (cases !== undefined && groups !== undefined) throw Error('Choose cases or groups, not both.');
  const allCases = sharedCaseUnits.flatMap(unit => unit.includes);
  const requestedCases = cases === undefined ? undefined : entries(cases, allCases, 'cases');
  const requestedGroups = groups === undefined ? undefined : entries(groups, renderingGroups, 'groups');
  const units = sharedCaseUnits.filter(unit => requestedCases ? unit.includes.some(id => requestedCases.includes(id)) :
    requestedGroups ? unit.groups.some(id => requestedGroups.includes(id)) : true);
  if (!units.length) throw Error('Empty rendering selection.');
  const includedCases = units.flatMap(unit => unit.includes);
  return { mode: requestedCases ? 'cases' : requestedGroups ? 'groups' : 'full',
    requestedCases: requestedCases ?? [], requestedGroups: requestedGroups ?? [], units: units.map(unit => unit.id), includedCases,
    companions: requestedCases ? includedCases.filter(id => !requestedCases.includes(id)) : [],
    groups: renderingGroups.filter(group => units.some(unit => unit.groups.includes(group))),
    expectedResults: includedCases.reduce((total, id) => total + inventory[id].length, 0) };
}

export function expectedCaseVariants(unitId) {
  const unit = sharedCaseUnits.find(unit => unit.id === unitId);
  if (!unit) throw Error('Unknown execution unit: ' + unitId);
  return unit.includes.flatMap(id => inventory[id].map(([theme, level, cycle]) => [id, theme, level, cycle]));
}

export function resultVariants(results) {
  return results.map(row => [row.case, row.theme, row.level ?? null, row.cycle ?? null]);
}

export function caseListing() {
  return sharedCaseUnits.flatMap(unit => unit.includes.map(id => ({ id, unit: unit.id, groups: unit.groups,
    companions: unit.includes.filter(other => other !== id), combinations: expectedCaseVariants(unit.id).length })));
}
