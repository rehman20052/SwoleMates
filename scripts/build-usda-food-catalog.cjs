const fs = require('node:fs');
const path = require('node:path');

const sourceRoot = process.argv[2];
const output = process.argv[3] || path.join(process.cwd(), 'src', 'data', 'usda-foods.json');
if (!sourceRoot) throw new Error('Usage: node scripts/build-usda-food-catalog.cjs <extracted USDA directory> [output]');

const files = fs.readdirSync(sourceRoot, { recursive: true })
  .filter(name => name.endsWith('.json'))
  .map(name => path.join(sourceRoot, name));
const roots = { FoundationFoods: 0, SRLegacyFoods: 1, SurveyFoods: 2 };
const nutrients = { calories: [1008, 2047, 2048], protein: [1003], carbs: [1005], fats: [1004] };
const normalize = value => value.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
const rounded = value => Math.round(value * 10) / 10;
const result = new Map();

for (const file of files) {
  const document = JSON.parse(fs.readFileSync(file, 'utf8'));
  const rootName = Object.keys(roots).find(key => Array.isArray(document[key]));
  if (!rootName) continue;
  for (const food of document[rootName]) {
    if (!food || typeof food !== 'object') continue;
    const name = typeof food.description === 'string' ? food.description.trim() : '';
    if (!name || name.length > 180) continue;
    const values = {};
    for (const [key, ids] of Object.entries(nutrients)) {
      const match = food.foodNutrients?.find(item => ids.includes(item.nutrient?.id) && item.nutrient?.unitName === (key === 'calories' ? 'kcal' : 'g'));
      values[key] = Number(match?.amount);
    }
    if (!Object.values(values).every(Number.isFinite) || values.calories < 0 || values.calories > 1000 || Object.values(values).slice(1).some(value => value < 0 || value > 100)) continue;
    const key = normalize(name);
    const candidate = {
      id: `usda-${food.fdcId}`,
      name,
      per100g: Object.fromEntries(Object.entries(values).map(([nutrient, value]) => [nutrient, rounded(value)])),
    };
    const previous = result.get(key);
    if (!previous || roots[rootName] < previous.priority) result.set(key, { priority: roots[rootName], food: candidate });
  }
}

const foods = [...result.values()].map(item => item.food).sort((a, b) => a.name.localeCompare(b.name));
fs.writeFileSync(output, `${JSON.stringify(foods)}\n`);
console.log(`Wrote ${foods.length} USDA foods to ${output}`);
