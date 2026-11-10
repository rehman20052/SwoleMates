import { useAppData } from './app-data';
import { convertWeight, type WeightUnit } from '@/lib/weight-unit';
export { convertWeight, type WeightUnit } from '@/lib/weight-unit';
export function useWeightUnit() {
  const { workspaceSettings, saveWorkspaceSetting, accountUserId } = useAppData();
  const setting = workspaceSettings.find(item => item.id === 'preference:weight-unit');
  const unit: WeightUnit = typeof setting?.value === 'object' && setting.value.content === 'kg' ? 'kg' : 'lb';
  return { unit, formatWeight: (value: number, from: WeightUnit = 'lb') => Number(convertWeight(value, from, unit).toFixed(1)),
    setUnit: (next: WeightUnit) => accountUserId ? saveWorkspaceSetting('preference:weight-unit', next, accountUserId, Date.now()) : Promise.resolve(false) };
}
