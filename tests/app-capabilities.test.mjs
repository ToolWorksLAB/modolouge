import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import {
  reconcileRequirements,
  emptyBrand,
  emptySpecification,
  configurationKey,
  confirmConfiguration,
  canConfirmConfiguration,
  modelBlueprint,
} from "../lib/app-capabilities.js";
import { validateBlueprint, graphOverview } from "../lib/ai-blueprint.js";
import { specificationPdf } from "../lib/specification-pdf.js";

const definition = {
  controls: [
    {
      name: "width",
      instanceId: "w",
      kind: "number",
      value: 9.9,
      min: 1,
      max: 20,
    },
  ],
  graph: { nodes: [], wires: [], groups: [] },
};
const plan = () => ({
  title: "Shelf",
  description: "A private design",
  audience: "Client",
  theme: "paper",
  accent: "blue",
  arrangement: "model",
  confidence: "medium",
  reasoning: "Draft",
  questions: [],
  warnings: [],
  steps: [
    {
      id: "shape",
      title: "Dimensions",
      description: "",
      evidence: [],
      controls: [{ binding: "w", label: "Width", help: "" }],
    },
  ],
  brand: emptyBrand(),
  specification: emptySpecification(),
  workflow: { review: true, pdf: true, assemblyRequested: true },
  requirements: [],
});
test("runtime reconciles actual capabilities and never certifies assembly or branding", () => {
  const p = plan();
  p.brand.name = "Requested brand";
  const checked = validateBlueprint(p, definition);
  assert.equal(
    checked.requirements.find((r) => r.capability === "assembly_documentation")
      .status,
    "unsupported",
  );
  assert.equal(
    checked.requirements.find((r) => r.capability === "branding").status,
    "needs_information",
  );
  assert.equal(
    checked.requirements.find((r) => r.capability === "specification_pdf")
      .status,
    "implemented",
  );
  assert.doesNotThrow(() => validateBlueprint(checked, definition));
  const answered = reconcileRequirements({
    ...checked,
    requirements: checked.requirements.map((r) => ({ ...r, question: "" })),
    answers: [
      {
        id: "assembly-documentation",
        question: "Which material?",
        value: "Undecided",
      },
    ],
  });
  assert.ok(
    answered.requirements.every((r) => r.question === ""),
    "Do not reinsert questions the agent has deferred after an answer",
  );
  assert.equal(
    reconcileRequirements({ ...p, requirements: [] }, checked).requirements
      .length,
    checked.requirements.length,
  );
  assert.throws(() =>
    validateBlueprint(
      { ...p, logo: "data:image/svg+xml;base64,PHN2Zz4=" },
      definition,
    ),
  );
  assert.throws(() =>
    validateBlueprint(
      { ...p, brand: { ...p.brand, reference: "javascript:alert(1)" } },
      definition,
    ),
  );
});
test("confirmation is immutable, bound to revision/settings/values, and refuses stale geometry", async () => {
  const input = {
    blueprint: plan(),
    definition,
    values: { width: 9.9 },
    revision: 4,
  };
  const key = configurationKey(input),
    snapshot = await confirmConfiguration(input, null);
  assert.equal(snapshot.controls[0].value, 9.9);
  input.values.width = 11.9;
  input.blueprint.specification.material = "Plywood";
  assert.equal(snapshot.controls[0].value, 9.9);
  assert.equal(snapshot.specification.material, "");
  assert.notEqual(configurationKey(input), key);
  assert.notEqual(
    configurationKey({ ...input, revision: 5 }),
    configurationKey(input),
  );
  const state = {
    objects: [{}],
    values: { width: 11.9 },
    solvedValues: { width: 9.9 },
    busy: false,
    invalid: false,
  };
  assert.equal(canConfirmConfiguration(state), false);
  assert.equal(
    canConfirmConfiguration({ ...state, solvedValues: { width: 11.9 } }),
    true,
  );
  assert.equal(
    canConfirmConfiguration({
      ...state,
      solvedValues: { width: 11.9 },
      invalid: true,
    }),
    false,
  );
  assert.equal(
    canConfirmConfiguration({
      ...state,
      solvedValues: { width: 11.9 },
      objects: [],
    }),
    false,
  );
});
test("compact graph context and AI drafts exclude logo bytes and verbose topology", () => {
  const context = graphOverview({
    ...definition,
    graph: {
      nodes: [{ id: "a", name: "Panel", text: "x".repeat(100) }],
      wires: [{ sourceNode: "a", targetNode: "b" }],
      groups: [],
    },
  });
  assert.equal(context.nodes[0].text, undefined);
  assert.equal(context.wires, undefined);
  assert.equal(context.wireCount, 1);
  assert.equal(
    modelBlueprint({ ...plan(), logo: "secret pixels" }).logo,
    undefined,
  );
});
test("PDF export contains a real multipage document and never mutates the confirmation", async () => {
  const p = plan();
  p.specification.notes =
    "A long specification with accented text: café, diseño. ".repeat(20);
  const manyInputs = {
    ...definition,
    controls: Array.from({ length: 40 }, (_, i) => ({
      ...definition.controls[0],
      name: "dimension-" + i,
      instanceId: "d" + i,
    })),
  };
  const snapshot = await confirmConfiguration(
    { blueprint: p, definition: manyInputs, values: {}, revision: 4 },
    null,
  );
  const before = JSON.stringify(snapshot);
  const bytes = await specificationPdf(
    snapshot,
    await readFile(
      new URL("../public/fonts/Poppins-Regular.ttf", import.meta.url),
    ),
  );
  const pdf = await PDFDocument.load(bytes);
  assert.ok(pdf.getPageCount() >= 2);
  assert.equal(pdf.getTitle(), "Shelf - configuration specification");
  assert.equal(JSON.stringify(snapshot), before);
});
