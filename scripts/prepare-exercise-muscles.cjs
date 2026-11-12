// Uses the same wger exerciseinfo snapshot as prepare-exercise-artwork.cjs.
const fs = require('node:fs');
const { results } = JSON.parse(fs.readFileSync('.expo/exercise-image-source.json', 'utf8').replace(/^\uFEFF/, ''));
const groupById = {
  1: 'Biceps', 2: 'Shoulders', 3: 'Chest', 4: 'Chest', 5: 'Triceps',
  6: 'Core', 7: 'Calves', 8: 'Glutes', 9: 'Back', 10: 'Quads',
  11: 'Hamstrings', 12: 'Back', 13: 'Biceps', 14: 'Core', 15: 'Calves',
};
const entries = new Map();
for (const exercise of results) {
  const groups = [...new Set(exercise.muscles.map(muscle => groupById[muscle.id]).filter(Boolean))].sort().join('|');
  if (!groups) continue;
  for (const translation of exercise.translations.filter(item => item.language === 2)) {
    for (const name of [translation.name, ...(translation.aliases ?? []).map(alias => typeof alias === 'string' ? alias : alias.alias || alias.name)]) {
      if (typeof name !== 'string' || !name.trim()) continue;
      const key = name.trim().replace(/\s+/g, ' ').toLowerCase();
      entries.set(key, entries.has(key) && entries.get(key) !== groups ? null : groups);
    }
  }
}
const rows = [...entries].filter(([, groups]) => groups).sort(([a], [b]) => a.localeCompare(b, 'en'));
const lines = rows.map(row => '  ' + JSON.stringify(row) + ',').join('\n');
fs.writeFileSync('src/lib/exercise-muscle-catalog.ts', '// Generated from wger exerciseinfo primary muscle metadata. See scripts/prepare-exercise-muscles.cjs.\nexport const exerciseMuscleCatalog: [string, string][] = [\n' + lines + '\n];\n');
