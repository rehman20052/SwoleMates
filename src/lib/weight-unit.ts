export type WeightUnit = 'lb' | 'kg';
export function convertWeight(value: number, from: WeightUnit, to: WeightUnit) {
  return from === to ? value : value * (to === 'kg' ? 0.45359237 : 1 / 0.45359237);
}
