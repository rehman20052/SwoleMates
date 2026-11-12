import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useAppData } from '@/state/app-data';
import { useAppTheme } from '@/theme';
import { muscleGroups, muscleSettingId, savedMuscleClassifications, type MuscleGroup } from '@/lib/exercise-muscles';
import { AppText, PrimaryButton, SecondaryButton } from './ui';

export function useMuscleClassifications() {
  const { workspaceSettings } = useAppData();
  return useMemo(() => savedMuscleClassifications(workspaceSettings), [workspaceSettings]);
}

export function ExerciseMusclePicker({ name, onSaved, onCancel }: {
  name: string;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const { colors } = useAppTheme();
  const { accountUserId, saveWorkspaceSetting } = useAppData();
  const [selected, setSelected] = useState<MuscleGroup[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const active = useRef(false);
  const saving = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);

  async function save() {
    if (!selected.length || saving.current) return;
    if (!accountUserId) { setError('Sign in to save the muscle classification.'); return; }
    saving.current = true;
    setBusy(true);
    setError('');
    try {
      const content = JSON.stringify({ name, groups: selected });
      const saved = await saveWorkspaceSetting(muscleSettingId(name), content, accountUserId, Date.now());
      if (!active.current) return;
      if (saved) onSaved();
      else setError('Could not save the muscle classification. Try again.');
    } catch {
      if (active.current) setError('Could not save the muscle classification. Try again.');
    } finally {
      saving.current = false;
      if (active.current) setBusy(false);
    }
  }

  return <View style={{ gap: 12 }}>
    <AppText size={17} weight="semibold">Muscles targeted by {name}</AppText>
    <AppText size={13} muted>Select the primary muscle groups.</AppText>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {muscleGroups.map(group => {
        const checked = selected.includes(group);
        return <Pressable key={group} accessibilityRole="checkbox" accessibilityState={{ checked, disabled: busy }}
          disabled={busy} onPress={() => setSelected(current => checked ? current.filter(item => item !== group) : [...current, group])}
          style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: checked ? colors.accent : colors.border, backgroundColor: checked ? colors.primaryTint : colors.surfaceRaised }}>
          <AppText size={14} color={checked ? colors.accent : colors.text}>{group}</AppText>
        </Pressable>;
      })}
    </View>
    {error ? <AppText accessibilityRole="alert" color={colors.danger}>{error}</AppText> : null}
    <PrimaryButton disabled={busy || !selected.length} onPress={() => void save()}>{busy ? 'Saving…' : 'Save muscles'}</PrimaryButton>
    <SecondaryButton disabled={busy} onPress={onCancel}>Cancel classification</SecondaryButton>
  </View>;
}
