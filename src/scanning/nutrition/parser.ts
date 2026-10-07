import type { FieldEvidence, NutritionBasis, NutritionField, ParsedNutrition, TextFrame, TextObservation } from "../types";

type Row = { tokens: TextObservation[]; text: string; y: number; height: number };
const empty = <T>(): FieldEvidence<T> => ({ value: null, confidence: 0, observationIds: [], warnings: [] });
const centerY = (item: TextObservation) => item.bounds.y + item.bounds.height / 2;
const right = (item: TextObservation) => item.bounds.x + item.bounds.width;
const clean = (value: string) => value.toLowerCase().replace(/[^a-z0-9%.,<]/g, "");

function rowsOf(frame: TextFrame): Row[] {
  const sorted = [...frame.observations].filter(item => item.text.trim()).sort((a, b) => centerY(a) - centerY(b) || a.bounds.x - b.bounds.x);
  const rows: Row[] = [];
  for (const token of sorted) {
    const row = rows.find(candidate => Math.abs(centerY(token) - candidate.y) <= Math.max(token.bounds.height, candidate.height) * .65);
    if (row) {
      row.tokens.push(token); row.tokens.sort((a, b) => a.bounds.x - b.bounds.x);
      row.y = row.tokens.reduce((sum, item) => sum + centerY(item), 0) / row.tokens.length;
      row.height = Math.max(row.height, token.bounds.height); row.text = row.tokens.map(item => item.text).join(" ");
    } else rows.push({ tokens: [token], text: token.text, y: centerY(token), height: token.bounds.height });
  }
  return rows.sort((a, b) => a.y - b.y);
}

function numeric(text: string): { value: number; unit: string; percent: boolean } | null {
  const normalized = text.trim().replace(/([0-9OoIl])\s+([0-9OoIl])/g, "$1$2");
  const match = normalized.match(/^<?\s*([0-9OoIl]+(?:[.,][0-9OoIl]+)?)\s*(kcal|calories|g|mg|mcg|%)?\s*%?$/i);
  if (!match || /^\s*</.test(normalized)) return null;
  const raw = match[1].replace(/[Oo]/g, "0").replace(/[Il]/g, "1").replace(",", ".");
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return null;
  return { value, unit: (match[2] ?? "").toLowerCase(), percent: /%/.test(normalized) || match[2] === "%" };
}

function basisFrom(rows: Row[]): { basis: NutritionBasis; columnX: number | null; warning?: string } {
  const headings = rows.flatMap(row => row.tokens).filter(token => /per\s*(serving|container)|100\s*(g|ml)/i.test(token.text));
  const serving = headings.find(token => /per\s*serving/i.test(token.text));
  const container = headings.find(token => /per\s*container/i.test(token.text));
  const hundred = headings.find(token => /100\s*(g|ml)/i.test(token.text));
  if (serving) return { basis: "per_serving", columnX: serving.bounds.x + serving.bounds.width / 2 };
  if (container) return { basis: "per_container", columnX: container.bounds.x + container.bounds.width / 2 };
  if (hundred) return { basis: "per_100g", columnX: hundred.bounds.x + hundred.bounds.width / 2 };
  return { basis: "per_serving", columnX: null, warning: "No nutrition column heading was detected; US-label per-serving layout was assumed." };
}

const nutrientMatchers: Record<Exclude<NutritionField, "servingSize" | "servingsPerContainer">, RegExp> = {
  calories: /^calories(?:fromfat)?$/,
  fat: /^totalfat$/,
  carbs: /^totalcarbohydrates?$|^totalcarbs?$|^carbohydrates?$/,
  protein: /^proteins?$/,
};

function findLabel(row: Row, pattern: RegExp) {
  for (let start = 0; start < row.tokens.length; start++) {
    let joined = "";
    for (let end = start; end < Math.min(row.tokens.length, start + 3); end++) {
      joined += clean(row.tokens[end].text);
      if (pattern.test(joined)) return { tokens: row.tokens.slice(start, end + 1), end };
    }
  }
  return null;
}

function fieldFromRow(row: Row, pattern: RegExp, basisX: number | null, calories = false): FieldEvidence<number> {
  const label = findLabel(row, pattern);
  if (!label) return empty();
  const candidates = row.tokens.slice(label.end + 1).map(token => ({ token, amount: numeric(token.text) }))
    .filter((item): item is { token: TextObservation; amount: NonNullable<ReturnType<typeof numeric>> } => Boolean(item.amount))
    .filter(item => !item.amount.percent && (calories ? !["g", "mg", "mcg"].includes(item.amount.unit) : item.amount.unit === "g"));
  if (!candidates.length) return { ...empty(), observationIds: label.tokens.map(item => item.id), warnings: ["Nutrient quantity was not found beside its label."] };
  const labelRight = Math.max(...label.tokens.map(right));
  const ranked = candidates.map(item => ({ ...item, distance: basisX === null ? Math.max(0, item.token.bounds.x - labelRight) : Math.abs(item.token.bounds.x + item.token.bounds.width / 2 - basisX) }))
    .sort((a, b) => a.distance - b.distance);
  const choice = ranked[0];
  const ambiguous = ranked[1] && Math.abs(ranked[1].distance - choice.distance) < .04;
  const confidence = Math.max(0, Math.min(1, [...label.tokens, choice.token].reduce((sum, item) => sum + item.confidence, 0) / (label.tokens.length + 1) - (ambiguous ? .25 : 0)));
  return { value: choice.amount.value, confidence, observationIds: [...label.tokens.map(item => item.id), choice.token.id], warnings: ambiguous ? ["Multiple nearby numeric columns were ambiguous."] : [] };
}

function servingFields(rows: Row[]) {
  const servingSize = empty<string>(), servingsPerContainer = empty<number>();
  for (const row of rows) {
    if (/servings?\s*per\s*container/i.test(row.text)) {
      const match = row.text.match(/servings?\s*per\s*container\s*:?\s*(?:about\s*)?([0-9OoIl]+(?:[.,][0-9OoIl]+)?)/i);
      if (match) Object.assign(servingsPerContainer, { value: numeric(match[1])?.value ?? null, confidence: Math.min(...row.tokens.map(item => item.confidence)), observationIds: row.tokens.map(item => item.id) });
    }
    if (/serving\s*size/i.test(row.text)) {
      const match = row.text.match(/serving\s*size\s*:?\s*(.+)$/i);
      if (match?.[1]?.trim()) Object.assign(servingSize, { value: match[1].trim(), confidence: Math.min(...row.tokens.map(item => item.confidence)), observationIds: row.tokens.map(item => item.id) });
    }
  }
  return { servingSize, servingsPerContainer };
}

export function parseNutritionFrame(frame: TextFrame): ParsedNutrition {
  const rows = rowsOf(frame);
  const selected = basisFrom(rows);
  const serving = servingFields(rows);
  const result: ParsedNutrition = {
    basis: selected.basis,
    ...serving,
    calories: empty(), protein: empty(), carbs: empty(), fat: empty(), confidence: 0,
    warnings: selected.warning ? [selected.warning] : [],
  };
  for (const [field, pattern] of Object.entries(nutrientMatchers) as [keyof typeof nutrientMatchers, RegExp][]) {
    const row = rows.find(candidate => findLabel(candidate, pattern));
    if (row) result[field] = fieldFromRow(row, pattern, selected.columnX, field === "calories");
  }
  const macros = [result.protein, result.carbs, result.fat];
  if (result.calories.value !== null && macros.every(field => field.value !== null)) {
    const derived = result.protein.value! * 4 + result.carbs.value! * 4 + result.fat.value! * 9;
    if (Math.abs(derived - result.calories.value) > Math.max(80, result.calories.value * .45)) result.warnings.push("Calories differ substantially from the recognized macros; confirm the selected column.");
  }
  for (const field of [result.calories, result.protein, result.carbs, result.fat]) result.warnings.push(...field.warnings);
  const found = [result.calories, result.protein, result.carbs, result.fat].filter(field => field.value !== null);
  result.confidence = found.length ? found.reduce((sum, field) => sum + field.confidence, 0) / 4 : 0;
  return result;
}
