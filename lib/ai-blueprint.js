import { z } from "zod";
import {
  workflowSchema,
  brandSchema,
  specificationSchema,
  requirementSchema,
  answerSchema,
  reconcileRequirements,
} from "./app-capabilities.js";

export const blueprintSchema = z.object({
  title: z.string().min(1).max(100),
  description: z.string().max(500),
  audience: z.string().max(200),
  theme: z.enum(["paper", "graphite"]),
  accent: z.enum(["pink", "green", "blue"]),
  arrangement: z.enum(["model", "balanced"]),
  confidence: z.enum(["high", "medium", "low"]),
  reasoning: z.string().max(1200),
  questions: z.array(z.string().max(300)).max(4),
  warnings: z.array(z.string().max(400)).max(8),
  workflow: workflowSchema.optional(),
  brand: brandSchema.optional(),
  specification: specificationSchema.optional(),
  requirements: z.array(requirementSchema).max(20).optional(),
  answers: z.array(answerSchema).max(20).optional(),
  logo: z
    .string()
    .max(45000)
    .regex(/^(?:data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/=]+)?$/)
    .optional(),
  steps: z
    .array(
      z.object({
        id: z.string().regex(/^[a-z][a-z0-9-]{0,39}$/),
        title: z.string().min(1).max(80),
        description: z.string().max(400),
        evidence: z.array(z.string().max(100)).max(12),
        controls: z
          .array(
            z.object({
              binding: z.string().min(1).max(220),
              label: z.string().min(1).max(100),
              help: z.string().max(300),
            }),
          )
          .max(120),
      }),
    )
    .min(1)
    .max(6),
});

export function validateBlueprint(raw, definition) {
  const plan = blueprintSchema.parse(raw);
  const controls = new Map(
    (definition.controls || []).map((c) => [c.instanceId || c.name, c]),
  );
  const nodes = new Set((definition.graph?.nodes || []).map((n) => n.id));
  const steps = new Set(),
    bound = new Set();
  if (controls.size > 120)
    throw new Error("AI apps currently support up to 120 exposed controls.");
  for (const step of plan.steps) {
    if (steps.has(step.id)) throw new Error("App steps must have unique IDs.");
    steps.add(step.id);
    if (step.evidence.some((id) => !nodes.has(id)))
      throw new Error("The draft cited a node that is not in this file.");
    for (const c of step.controls) {
      if (!controls.has(c.binding) || bound.has(c.binding))
        throw new Error(
          "The draft contains an unknown or repeated input binding.",
        );
      bound.add(c.binding);
    }
  }
  // Never silently discard a real input. Unclassified inputs remain available.
  const missing = [...controls].filter(([key]) => !bound.has(key));
  if (missing.length) {
    const target = plan.steps.at(-1);
    target.controls.push(
      ...missing.map(([binding, c]) => ({
        binding,
        label: c.label || c.name,
        help: "Additional input from your definition.",
      })),
    );
    plan.warnings = [
      ...plan.warnings.slice(0, 7),
      "Inputs not classified by AI were kept in the final step. Review their placement.",
    ];
  }
  if (plan.requirements || plan.workflow) return reconcileRequirements(plan);
  return plan;
}

// Compact overview for ordinary design turns. Full topology is retrieved only when needed.
export function graphOverview(definition) {
  const full = graphContext(definition);
  return {
    controls: full.controls,
    groups: full.groups.map(({ label, members }) => ({
      label,
      count: members?.length || 0,
    })),
    nodes: full.nodes.map(({ id, name, label, kind }) => ({
      id,
      name,
      label,
      kind,
    })),
    wireCount: full.wires.length,
    notes: full.notes,
    scope: full.scope,
  };
}

export function graphContext(definition) {
  const graph = definition.graph || {};
  const controls = (definition.controls || []).map((c) => ({
    binding: c.instanceId || c.name,
    name: c.name,
    label: c.label,
    kind: c.kind,
    min: c.min,
    max: c.max,
    value: c.kind === "number" || c.kind === "boolean" ? c.value : undefined,
    step: c.step,
  }));
  if (controls.length > 120)
    throw new Error("AI apps currently support up to 120 exposed controls.");
  const nodes = (graph.nodes || []).slice(0, 500).map((n) => ({
    id: n.id,
    name: n.name,
    label: n.label,
    kind: n.kind,
    description: n.description?.slice(0, 180),
    text: n.text?.slice(0, 240),
    inputs: (n.inputs || [])
      .slice(0, 16)
      .map((p, index) => ({ index, id: p.id, name: p.name, label: p.label })),
    outputs: (n.outputs || [])
      .slice(0, 16)
      .map((p, index) => ({ index, id: p.id, name: p.name, label: p.label })),
  }));
  const groups = (graph.groups || []).map((g) => ({
    label: g.label,
    members: g.members,
  }));
  const wires = (graph.wires || []).map((w) => [
    w.sourceNode,
    w.targetNode,
    w.sourcePort,
    w.targetPort,
  ]);
  const context = {
    controls,
    nodes,
    groups,
    wires,
    notes: graph.notes || [],
    scope:
      "Saved archive metadata; no script execution, runtime trees or source-code analysis.",
  };
  if (new TextEncoder().encode(JSON.stringify(context)).length > 65000) {
    // Keep complete connectivity and control identity; omit verbose descriptions.
    context.nodes = nodes.map(({ id, name, label, kind }) => ({
      id,
      name,
      label,
      kind,
    }));
    context.wires = [...new Map(wires.map((w) => [w.join(":"), w])).values()];
    context.notes = [
      ...context.notes,
      "Verbose node text omitted to stay inside the AI context limit.",
    ];
  }
  if (new TextEncoder().encode(JSON.stringify(context)).length > 65000)
    throw new Error(
      "This graph is too large for one AI analysis. Simplify or use the manual workspace.",
    );
  return context;
}

export function usageFromSteps(steps, model = "openai/gpt-5.4-mini") {
  const result = {
    input_tokens: 0,
    output_tokens: 0,
    cache_tokens: 0,
    reasoning_tokens: 0,
    cost_usd: null,
    estimate_usd: 0,
    generation_ids: [],
  };
  let allCosts = steps.length > 0,
    actual = 0;
  for (const s of steps) {
    const u = s.usage || {},
      g = s.providerMetadata?.gateway || {};
    result.input_tokens += u.inputTokens || 0;
    result.output_tokens += u.outputTokens || 0;
    result.cache_tokens += u.inputTokenDetails?.cacheReadTokens || 0;
    result.reasoning_tokens += u.outputTokenDetails?.reasoningTokens || 0;
    if (g.generationId) result.generation_ids.push(g.generationId);
    const cost = g.cost;
    if (cost !== undefined && cost !== null && Number.isFinite(Number(cost)))
      actual += Number(cost);
    else allCosts = false;
  }
  // GPT-5.4 mini catalog prices checked 2026-10-10; reasoning is already in outputTokens.
  const rates =
    model === "openai/gpt-6.1-sol"
      ? [0.000002, 0.0000001, 0.00001]
      : [0.00000075, 0.000000075, 0.0000045];
  result.estimate_usd =
    Math.max(0, result.input_tokens - result.cache_tokens) * rates[0] +
    result.cache_tokens * rates[1] +
    result.output_tokens * rates[2];
  if (allCosts) result.cost_usd = actual;
  return result;
}
