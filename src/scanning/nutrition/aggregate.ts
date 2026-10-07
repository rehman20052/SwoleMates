import type { FieldEvidence, NutritionField, ParsedNutrition } from "../types";

type Value = string | number;
type Vote = { value: Value; weight: number; frames: number; evidence: string[] };
const fields: NutritionField[] = ["servingSize", "servingsPerContainer", "calories", "protein", "carbs", "fat"];
const keyOf = (value: Value) => typeof value === "number" ? value.toFixed(2) : value.trim().toLowerCase();

export class NutritionFrameAggregator {
  private votes = new Map<NutritionField, Map<string, Vote>>();
  private frames = 0;

  add(result: ParsedNutrition) {
    this.frames++;
    for (const field of fields) {
      const evidence = result[field] as FieldEvidence<Value>;
      if (evidence.value === null || evidence.confidence < .35) continue;
      const choices = this.votes.get(field) ?? new Map<string, Vote>();
      const key = keyOf(evidence.value);
      const vote = choices.get(key) ?? { value: evidence.value, weight: 0, frames: 0, evidence: [] };
      vote.weight += evidence.confidence; vote.frames++; vote.evidence.push(...evidence.observationIds);
      choices.set(key, vote); this.votes.set(field, choices);
    }
    return this.snapshot(result.basis);
  }

  snapshot(basis: ParsedNutrition["basis"] = "unknown") {
    const output = { basis, warnings: [] as string[], confidence: 0 } as ParsedNutrition;
    let total = 0;
    for (const field of fields) {
      const ranked = [...(this.votes.get(field)?.values() ?? [])].sort((a, b) => b.weight - a.weight || b.frames - a.frames);
      const winner = ranked[0];
      const stable = winner && (winner.frames >= 2 || winner.weight >= 1.8);
      const confidence = winner ? Math.min(1, winner.weight / Math.max(2, this.frames * .65)) : 0;
      output[field] = { value: stable ? winner.value : null, confidence, observationIds: winner?.evidence ?? [], warnings: winner && !stable ? ["Waiting for another agreeing frame."] : [] } as never;
      if (["calories", "protein", "carbs", "fat"].includes(field)) total += confidence;
    }
    output.confidence = total / 4;
    return output;
  }

  reset() { this.votes.clear(); this.frames = 0; }
}

export function hasReliableNutrition(result: ParsedNutrition) {
  return result.calories.value !== null && result.protein.value !== null && result.carbs.value !== null && result.fat.value !== null && result.confidence >= .7;
}
