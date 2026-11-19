import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const exports = {};
const code = ts.transpileModule(readFileSync('src/lib/recipes.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
vm.runInNewContext(code, { exports, require(name) {
  if (name === '@react-native-async-storage/async-storage') return { getItem: async () => null, setItem: async () => {} };
  return JSON.parse(readFileSync(name.replace('@/', 'src/'), 'utf8'));
}});
const { recipes, ingredient, macrosPerServing, applySwaps, problems, swapIdeas, searchRecipes, scaleMacros } = exports;

test('every bundled recipe and substitution has valid ingredients and finite serving nutrition', () => {
  assert.ok(recipes.length > 0);
  assert.equal(new Set(recipes.map(recipe => recipe.id)).size, recipes.length);
  for (const recipe of recipes) {
    assert.ok(recipe.servings > 0 && recipe.ingredients.length > 0 && recipe.steps.length > 0);
    for (const line of recipe.ingredients) {
      assert.ok(line.grams > 0); assert.ok(ingredient(line.id));
      for (const idea of swapIdeas(line.id, [], [])) {
        if (idea.to) assert.ok(ingredient(idea.to));
        const nutrition = macrosPerServing(recipe, applySwaps(recipe, { [line.id]: idea.to }));
        assert.ok(Object.values(nutrition).every(value => Number.isFinite(value) && value >= 0));
      }
    }
    assert.ok(Object.values(macrosPerServing(recipe)).every(value => Number.isFinite(value) && value >= 0));
  }
});

test('recipe search, allergy checks and substitutions use structured ingredient data', () => {
  const pasta = recipes.find(recipe => recipe.id === 'pasta-e-fagioli');
  assert.ok(searchRecipes('fagioli', null).some(recipe => recipe.id === pasta.id));
  assert.equal(searchRecipes('fagioli', 'Japanese').length, 0);
  assert.ok(problems(pasta.ingredients, ['Gluten-free'], ['Wheat']).length > 0);
  for (const line of pasta.ingredients) {
    for (const idea of swapIdeas(line.id, ['Vegan', 'Gluten-free'], ['Wheat', 'Milk'])) {
      if (idea.to) assert.equal(problems([{ ...line, id: idea.to }], ['Vegan', 'Gluten-free'], ['Wheat', 'Milk']).length, 0);
    }
  }
  const base = macrosPerServing(pasta);
  const doubled = scaleMacros(base, 2);
  for (const key of Object.keys(base)) assert.equal(doubled[key], base[key] * 2);
});
