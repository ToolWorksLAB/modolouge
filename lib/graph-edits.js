import { z } from "zod";

// Explicit, bounded operations. Null means that a field does not apply.
export const graphEditSchema = z
  .object({
    op: z.enum([
      "rename",
      "slider",
      "panel",
      "expression",
      "connect",
      "disconnect",
      "clone",
      "remove",
    ]),
    nodeId: z.string().uuid(),
    text: z.string().max(1000).nullable(),
    value: z.number().finite().min(-1e6).max(1e6).nullable(),
    min: z.number().finite().min(-1e6).max(1e6).nullable(),
    max: z.number().finite().min(-1e6).max(1e6).nullable(),
    input: z.number().int().min(0).max(127).nullable(),
    sourceNode: z.string().uuid().nullable(),
    output: z.number().int().min(0).max(127).nullable(),
    newId: z.string().uuid().nullable(),
  })
  .strict();
export const graphEditsSchema = z.array(graphEditSchema).max(24);
