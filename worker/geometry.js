import rhino3dm from "rhino3dm";
import { compute } from "./compute.js";
const rhino = await rhino3dm();

export async function previewGeometry(values = []) {
  const objects = [],
    warnings = [],
    breps = [];
  let seen = 0;
  for (const tree of values) {
    for (const branch of Object.values(
      tree.InnerTree || tree.innerTree || {},
    )) {
      for (const item of branch) {
        if (++seen > 20000)
          throw new Error(
            "Preview limit reached (20,000 items). Reduce the definition output.",
          );
        const layer = tree.ParamName || tree.paramName;
        let geo;
        try {
          const data =
            typeof item.data === "string" ? JSON.parse(item.data) : item.data;
          const type = item.type || "";
          if (
            type === "Rhino.Geometry.Point3d" ||
            type === "Rhino.Geometry.Vector3d"
          ) {
            if (type.endsWith("Point3d"))
              objects.push({
                kind: "point",
                layer,
                point: [data.X, data.Y, data.Z],
              });
          } else if (type === "Rhino.Geometry.Line") {
            objects.push({
              kind: "curve",
              layer,
              points: [
                [data.From.X, data.From.Y, data.From.Z],
                [data.To.X, data.To.Y, data.To.Z],
              ],
            });
          } else if (data && typeof data === "object" && data.archive3dm) {
            geo = rhino.CommonObject.decode(data);
            if (!geo) continue;
            if (geo instanceof rhino.Mesh)
              objects.push({ kind: "mesh", layer, mesh: geo.toThreejsJSON() });
            else if (geo instanceof rhino.Point)
              objects.push({ kind: "point", layer, point: geo.location });
            else if (geo instanceof rhino.Curve) {
              const [a, b] = geo.domain;
              const count = geo instanceof rhino.LineCurve ? 1 : 160;
              objects.push({
                kind: "curve",
                layer,
                points: Array.from({ length: count + 1 }, (_, i) =>
                  geo.pointAt(a + ((b - a) * i) / count),
                ),
              });
            } else if (geo instanceof rhino.Brep) breps.push({ data, layer });
            else if (geo instanceof rhino.Extrusion) {
              const brep = geo.toBrep();
              breps.push({ data: brep.encode(), layer });
              brep.delete();
            } else if (geo instanceof rhino.Surface) {
              const brep = rhino.Brep.createFromSurface(geo);
              breps.push({ data: brep.encode(), layer });
              brep.delete();
            } else warnings.push(`Preview does not yet support ${type}.`);
          }
        } catch (error) {
          warnings.push(`Could not preview ${item.type}: ${error.message}`);
        } finally {
          geo?.delete();
        }
      }
    }
  }
  // Mesh on Compute: rhino3dm alone cannot tessellate a Brep.
  for (let start = 0; start < breps.length; start += 64) {
    const batch = breps.slice(start, start + 64);
    try {
      const args = batch.map((x) => [x.data]);
      // Compute treats a one-element batch as an ordinary argument list.
      const response = await compute(
        "/rhino/geometry/mesh/createfrombrep-brep" +
          (batch.length > 1 ? "?multiple=true" : ""),
        batch.length > 1 ? args : args[0],
      );
      const results = batch.length > 1 ? response : [response];
      if (!Array.isArray(results) || results.some((x) => !Array.isArray(x)))
        throw new Error("Compute returned an invalid meshing response.");
      for (let i = 0; i < batch.length; i++)
        for (const raw of results[i] || []) {
          const mesh = rhino.CommonObject.decode(raw);
          try {
            if (mesh)
              objects.push({
                kind: "mesh",
                layer: batch[i].layer,
                mesh: mesh.toThreejsJSON(),
              });
          } finally {
            mesh?.delete();
          }
        }
    } catch (error) {
      warnings.push(`Surface meshing failed: ${error.message}`);
    }
  }
  return { objects, warnings: [...new Set(warnings)] };
}
