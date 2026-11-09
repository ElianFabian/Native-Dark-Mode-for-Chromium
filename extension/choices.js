export function readChoice(group) {
  return group.querySelector('input[type=radio]:checked').value;
}

export function writeChoice(group, value) {
  const options = [...group.querySelectorAll('input[type=radio]')];
  const selected = options.find(option => option.value === value) ?? options.find(option => option.defaultChecked);
  selected.checked = true;
}
