"use client";
import {
  emptyBrand,
  emptySpecification,
  emptyWorkflow,
} from "../lib/app-capabilities.js";

export default function AppCapabilityEditor({ plan, change, onError }) {
  const brand = plan.brand || emptyBrand(),
    spec = plan.specification || emptySpecification(),
    workflow = plan.workflow || emptyWorkflow();
  async function logo(file) {
    if (!file) return;
    try {
      if (
        !["image/png", "image/jpeg"].includes(file.type) ||
        file.size > 2000000
      )
        throw new Error("Choose a PNG or JPEG logo under 2 MB.");
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 500 / bitmap.width, 160 / bitmap.height);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      canvas
        .getContext("2d")
        .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      const data = canvas.toDataURL("image/png");
      if (data.length > 45000)
        throw new Error(
          "This logo is too detailed. Use a simpler image under 500 × 160 pixels.",
        );
      change("logo", data);
    } catch (e) {
      onError(e.message);
    }
  }
  return (
    <section className="app-capability-editor">
      <h3>Brand & delivery</h3>
      <p>
        These settings are saved with the app. A reference link does not certify
        brand compliance.
      </p>
      <div className="app-settings-grid">
        <label>
          Brand name
          <input
            type="text"
            maxLength={100}
            value={brand.name}
            onChange={(e) =>
              change("brand", { ...brand, name: e.target.value })
            }
          />
        </label>
        <label>
          Brand accent
          <input
            type="color"
            value={brand.primary}
            onChange={(e) =>
              change("brand", { ...brand, primary: e.target.value })
            }
          />
        </label>
        <label>
          Typeface
          <select
            value={brand.font}
            onChange={(e) =>
              change("brand", { ...brand, font: e.target.value })
            }
          >
            <option value="poppins">Poppins</option>
            <option value="system">System sans</option>
            <option value="mono">Monospace</option>
          </select>
        </label>
        <label>
          Brand guide URL
          <input
            type="text"
            maxLength={1000}
            placeholder="https://…"
            value={brand.reference}
            onChange={(e) =>
              change("brand", { ...brand, reference: e.target.value })
            }
          />
        </label>
        <label>
          Logo · PNG or JPEG
          <input
            type="file"
            accept="image/png,image/jpeg"
            onChange={(e) => logo(e.target.files?.[0])}
          />
        </label>
        {plan.logo && (
          <div>
            <img
              className="app-logo-preview"
              src={plan.logo}
              alt="Current app logo"
            />
            <button className="quiet" onClick={() => change("logo", "")}>
              Remove logo
            </button>
          </div>
        )}
      </div>
      <label>
        Brand notes
        <textarea
          maxLength={1000}
          value={brand.notes}
          onChange={(e) => change("brand", { ...brand, notes: e.target.value })}
        />
      </label>
      <div className="app-settings-grid">
        <label className="ai-consent">
          <input
            type="checkbox"
            checked={workflow.review}
            onChange={(e) =>
              change("workflow", {
                ...workflow,
                review: e.target.checked,
                pdf: e.target.checked && workflow.pdf,
              })
            }
          />
          Review and confirm
        </label>
        <label className="ai-consent">
          <input
            type="checkbox"
            checked={workflow.pdf}
            onChange={(e) =>
              change("workflow", {
                ...workflow,
                pdf: e.target.checked,
                review: e.target.checked || workflow.review,
              })
            }
          />
          Download configuration PDF
        </label>
        <label>
          Model units
          <select
            value={spec.units}
            onChange={(e) =>
              change("specification", { ...spec, units: e.target.value })
            }
          >
            {["unspecified", "mm", "cm", "m", "in"].map((u) => (
              <option key={u} value={u}>
                {u === "unspecified" ? "Not specified" : u}
              </option>
            ))}
          </select>
          <small>Labels only; does not rescale the model.</small>
        </label>
        <label>
          Material
          <input
            type="text"
            maxLength={500}
            value={spec.material}
            placeholder="Not specified"
            onChange={(e) =>
              change("specification", { ...spec, material: e.target.value })
            }
          />
        </label>
        <label>
          Connections / joinery
          <input
            type="text"
            maxLength={500}
            value={spec.connections}
            placeholder="Not specified"
            onChange={(e) =>
              change("specification", { ...spec, connections: e.target.value })
            }
          />
        </label>
      </div>
      <label>
        Specification notes
        <textarea
          maxLength={1500}
          value={spec.notes}
          onChange={(e) =>
            change("specification", { ...spec, notes: e.target.value })
          }
        />
      </label>
    </section>
  );
}
