// Czech plural for the reward/UI copy: 1 klíč, 2–4 klíče, 0/5+ klíčů.
export function keysLabel(n) {
  const count = Number(n) || 0;
  if (count === 1) return '1 klíč';
  if (count >= 2 && count <= 4) return `${count} klíče`;
  return `${count} klíčů`;
}
