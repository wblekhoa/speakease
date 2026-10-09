import assert from "node:assert/strict";
import type { ModelInfo } from "@/bindings";
import catalog from "../../dev/models.fixture.json";
import { pickModels } from "./modelPicks";

// The catalog as the Models list sees it: legacy downloads hidden unless on
// disk (ModelsSettings.tsx isLegacyModel).
const models = (catalog as unknown as ModelInfo[]).filter(
  (model) =>
    !(typeof model.source === "object" && "Url" in model.source) ||
    model.is_downloaded,
);
const names = (language: string) =>
  pickModels(models, language).map((pick) => `${pick.kind}:${pick.model.name}`);

// Vietnamese: measured models only, best by word errors first.
const vi = pickModels(models, "vi");
assert.equal(vi[0].kind, "best");
assert.equal(vi[0].model.name, "Cohere Transcribe");
assert.equal(vi[0].wer, 6.3);
assert.ok(
  vi.every((pick) => pick.wer !== null),
  "vi picks are measured",
);
// Balanced is within 1.5 points of the best and faster than it.
const balanced = vi.find((pick) => pick.kind === "balanced");
assert.ok(balanced && balanced.wer! < 6.3 + 1.5);
assert.ok(balanced.model.speed_score > vi[0].model.speed_score);
// Live needs streaming.
assert.ok(vi.find((pick) => pick.kind === "live")?.model.supports_streaming);
// No model is suggested twice.
assert.equal(new Set(vi.map((p) => p.model.id)).size, vi.length);

// English: catalog scores, and every pick speaks English.
const en = pickModels(models, "en");
assert.ok(en.length >= 2, names("en").join(", "));
assert.ok(en.every((pick) => pick.wer === null));
assert.ok(
  en.every((pick) =>
    pick.model.supported_languages.some((l) => l.split("-")[0] === "en"),
  ),
);

// No language chosen: nothing to suggest.
assert.deepEqual(pickModels(models, "all"), []);

console.log("vi:", names("vi").join(" · "));
console.log("en:", names("en").join(" · "));
console.log("ja:", names("ja").join(" · "));
