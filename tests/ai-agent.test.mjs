import test from "node:test";
import assert from "node:assert/strict";
import { MockLanguageModelV4 } from "ai/test";
import { blueprintAgent } from "../lib/ai-agent.js";
import { usageFromSteps } from "../lib/ai-blueprint.js";
import {
  emptyBrand,
  emptySpecification,
  emptyWorkflow,
} from "../lib/app-capabilities.js";
test("real SDK loop reads the graph tool, validates structured output, and records both calls", async () => {
  const plan = {
    title: "Study",
    description: "Explore the shape",
    audience: "Designer",
    theme: "paper",
    accent: "green",
    arrangement: "model",
    confidence: "medium",
    reasoning: "A sphere with one input",
    questions: [],
    warnings: [],
    workflow: emptyWorkflow(),
    brand: emptyBrand(),
    specification: emptySpecification(),
    requirements: [],
    steps: [
      {
        id: "shape",
        title: "Shape",
        description: "Set radius",
        evidence: ["sphere"],
        controls: [{ binding: "r", label: "Radius", help: "Shape size" }],
      },
    ],
  };
  const usage = {
    inputTokens: { total: 100, noCache: 100, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: 50, text: 40, reasoning: 10 },
  };
  const model = new MockLanguageModelV4({
    doGenerate: [
      {
        content: [
          {
            type: "tool-call",
            toolCallId: "read-1",
            toolName: "read_definition",
            input: "{}",
          },
        ],
        finishReason: { unified: "tool-calls" },
        usage,
        warnings: [],
      },
      {
        content: [{ type: "text", text: JSON.stringify(plan) }],
        finishReason: { unified: "stop" },
        usage,
        warnings: [],
      },
    ],
  });
  const steps = [],
    context = {
      nodes: [{ id: "sphere", name: "Sphere" }],
      controls: [{ binding: "r", name: "Radius" }],
      wires: [],
    };
  const result = await blueprintAgent(context, {
    model,
    onStepEnd: (s) => steps.push(s),
  }).generate({ prompt: "Make a small sphere configurator" });
  assert.deepEqual(result.output, plan);
  assert.equal(model.doGenerateCalls.length, 2);
  assert.equal(steps.length, 2);
  assert.equal(model.doGenerateCalls[0].toolChoice.toolName, "read_definition");
  assert.ok(
    JSON.stringify(model.doGenerateCalls[1].prompt).includes('"Sphere"'),
  );
  const measured = usageFromSteps(steps);
  assert.equal(measured.input_tokens, 200);
  assert.equal(measured.output_tokens, 100);
  assert.equal(measured.reasoning_tokens, 20);
  let tests = 0;
  const toolCall = (name, input, id) => ({
    content: [
      {
        type: "tool-call",
        toolCallId: id,
        toolName: name,
        input: JSON.stringify(input),
      },
    ],
    finishReason: { unified: "tool-calls" },
    usage,
    warnings: [],
  });
  const repairModel = new MockLanguageModelV4({
    doGenerate: [
      toolCall("read_definition", {}, "read"),
      toolCall(
        "test_definition",
        { reason: "Check candidate", edits: [] },
        "test-1",
      ),
      toolCall(
        "test_definition",
        { reason: "Correct candidate", edits: [] },
        "test-2",
      ),
      toolCall("validate_app", plan, "validate"),
      {
        content: [{ type: "text", text: JSON.stringify(plan) }],
        finishReason: { unified: "stop" },
        usage,
        warnings: [],
      },
    ],
  });
  const trace = [];
  const repaired = await blueprintAgent(context, {
    model: repairModel,
    allowEdits: true,
    session: {
      context: () => context,
      definition: () => ({
        controls: [{ name: "r", kind: "number" }],
        graph: { nodes: [{ id: "sphere" }] },
      }),
      test: async () =>
        ++tests === 1
          ? { passed: false, errors: ["Invalid connection"] }
          : { passed: true, objects: 1 },
    },
    report: async (e) => trace.push(e),
  }).generate({
    prompt: "Repair and test the definition, then design its app",
  });
  assert.equal(tests, 2);
  assert.deepEqual(repaired.output, plan);
  assert.ok(
    trace.some((e) => e.tool === "validate_app" && e.status === "passed"),
  );
  assert.ok(
    JSON.stringify(repairModel.doGenerateCalls[2].prompt).includes(
      "Invalid connection",
    ),
  );
  assert.equal(repairModel.doGenerateCalls.length, 5);
  const refinementModel = new MockLanguageModelV4({
    doGenerate: [
      toolCall("read_definition", {}, "refine-read"),
      toolCall("validate_app", plan, "refine-validate"),
      {
        content: [{ type: "text", text: JSON.stringify(plan) }],
        finishReason: { unified: "stop" },
        usage,
        warnings: [],
      },
    ],
  });
  let refinementTests = 0;
  const refined = await blueprintAgent(context, {
    model: refinementModel,
    refinement: true,
    session: {
      context: () => context,
      definition: () => ({
        controls: [{ name: "r", kind: "number" }],
        graph: { nodes: [{ id: "sphere" }] },
      }),
      test: async () => {
        refinementTests++;
        throw new Error("Unnecessary Compute call");
      },
    },
  }).generate({ prompt: "Change the wording of this existing app only" });
  assert.equal(refinementTests, 0);
  assert.deepEqual(refined.output, plan);
  assert.equal(refinementModel.doGenerateCalls.length, 3);
});
