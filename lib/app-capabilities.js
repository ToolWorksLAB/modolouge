import { z } from "zod";

export const workflowSchema = z.object({
  review: z.boolean(),
  pdf: z.boolean(),
  assemblyRequested: z.boolean(),
});
export const brandSchema = z.object({
  name: z.string().max(100),
  primary: z.string().regex(/^#[a-fA-F0-9]{6}$/),
  font: z.enum(["poppins", "system", "mono"]),
  reference: z
    .string()
    .max(1000)
    .refine(
      (s) => !s || /^https:\/\/[^\s]+$/.test(s),
      "Use an HTTPS reference URL.",
    ),
  notes: z.string().max(1000),
});
export const specificationSchema = z.object({
  units: z.enum(["unspecified", "mm", "cm", "m", "in"]),
  material: z.string().max(500),
  connections: z.string().max(500),
  notes: z.string().max(1500),
});
export const requirementSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]{0,39}$/),
  title: z.string().min(1).max(120),
  capability: z.enum([
    "branding",
    "confirmation",
    "specification_pdf",
    "assembly_documentation",
    "geometry",
    "other",
  ]),
  status: z.enum(["implemented", "needs_information", "unsupported"]),
  detail: z.string().max(500),
  question: z.string().max(300),
});
export const answerSchema = z.object({
  id: z.string().max(80),
  question: z.string().max(300),
  value: z.string().max(1500),
});
export const emptyWorkflow = () => ({
  review: false,
  pdf: false,
  assemblyRequested: false,
});
export const emptyBrand = () => ({
  name: "",
  primary: "#44769b",
  font: "poppins",
  reference: "",
  notes: "",
});
export const emptySpecification = () => ({
  units: "unspecified",
  material: "",
  connections: "",
  notes: "",
});

// Capabilities are checked against the runtime, not the model's self-assessment.
export function reconcileRequirements(plan, previous = null) {
  const requirements = new Map(
    (previous?.requirements || []).map((r) => [r.id, r]),
  );
  for (const r of plan.requirements || []) requirements.set(r.id, r);
  const workflow = plan.workflow || emptyWorkflow();
  const ensure = (capability, title) => {
    if (![...requirements.values()].some((r) => r.capability === capability))
      requirements.set(capability, {
        id: capability.replaceAll("_", "-"),
        title,
        capability,
        status: "needs_information",
        detail: "",
        question: "",
      });
  };
  if (workflow.review || workflow.pdf)
    ensure("confirmation", "Review and confirm configuration");
  if (workflow.pdf) ensure("specification_pdf", "Download a configuration PDF");
  if (workflow.assemblyRequested)
    ensure("assembly_documentation", "Production assembly documentation");
  if (plan.brand?.name) ensure("branding", "Apply the brand guidelines");
  const checked = [...requirements.values()].map((r) => {
    if (r.capability === "confirmation")
      return {
        ...r,
        status:
          workflow.review || workflow.pdf ? "implemented" : "needs_information",
        detail:
          workflow.review || workflow.pdf
            ? "Review and confirmation screens are available. A matching geometry result is required to confirm."
            : "Enable the review workflow.",
        question: "",
      };
    if (r.capability === "specification_pdf")
      return {
        ...r,
        status: workflow.pdf ? "implemented" : "needs_information",
        detail: workflow.pdf
          ? "A downloadable specification records the confirmed values, revision and model image. It is not an assembly plan."
          : "Enable PDF export.",
        question: "",
      };
    if (r.capability === "assembly_documentation")
      return {
        ...r,
        status: "unsupported",
        detail:
          "Production assembly generation is not available yet. The configuration PDF does not invent parts, joints, hardware or assembly order.",
        question: r.question,
      };
    if (r.capability === "branding")
      return {
        ...r,
        status: "needs_information",
        detail: plan.brand?.reference
          ? "Brand settings and a reference are saved; compliance has not been independently verified."
          : "Brand settings are provisional until the brand guide and assets are supplied.",
        question: r.question,
      };
    return r;
  });
  if (checked.length > 20)
    throw new Error("Keep the project to 20 tracked requirements.");
  return {
    ...plan,
    workflow: { ...workflow, review: workflow.review || workflow.pdf },
    requirements: checked,
  };
}

export function modelBlueprint(plan) {
  if (!plan) return null;
  const { logo, ...rest } = plan;
  return { ...rest, hasLogo: !!logo };
}

export function configurationContent({
  blueprint,
  definition,
  values,
  revision = 0,
}) {
  const labels = new Map(
    blueprint.steps.flatMap((s) => s.controls.map((c) => [c.binding, c.label])),
  );
  return {
    title: blueprint.title,
    description: blueprint.description,
    revision,
    brand: blueprint.brand || emptyBrand(),
    logo: blueprint.logo || "",
    specification: blueprint.specification || emptySpecification(),
    assemblyRequested: !!blueprint.workflow?.assemblyRequested,
    controls: definition.controls.map((c) => ({
      binding: c.instanceId || c.name,
      label: labels.get(c.instanceId || c.name) || c.label || c.name,
      value: values[c.name] ?? c.value,
      kind: c.kind,
    })),
  };
}
export function configurationKey(input) {
  return JSON.stringify(configurationContent(input));
}
export function canConfirmConfiguration({
  objects,
  values,
  solvedValues,
  busy,
  invalid,
}) {
  return (
    !busy &&
    !invalid &&
    objects.length > 0 &&
    solvedValues != null &&
    Object.keys(values).every((key) => values[key] === solvedValues[key]) &&
    Object.keys(solvedValues).every((key) => values[key] === solvedValues[key])
  );
}
export async function confirmConfiguration(input, preview) {
  const content = configurationContent(input);
  const bytes = new TextEncoder().encode(JSON.stringify(content));
  const hash = [
    ...new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes)),
  ]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
  return structuredClone({
    ...content,
    id: hash,
    confirmedAt: new Date().toISOString(),
    preview: preview || null,
  });
}

export function foreground(hex) {
  const rgb = hex
    .slice(1)
    .match(/../g)
    .map((n) => {
      const c = parseInt(n, 16) / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2] > 0.179
    ? "#101710"
    : "#ffffff";
}
