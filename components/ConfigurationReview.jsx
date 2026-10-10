"use client";
import { useState } from "react";
import { configurationContent } from "../lib/app-capabilities.js";

export default function ConfigurationReview({
  input,
  ready,
  preview,
  confirmed,
  onConfirm,
  onBack,
  pdfEnabled,
}) {
  const [accepted, setAccepted] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const content = confirmed || configurationContent(input),
    spec = content.specification;
  async function confirm() {
    setError("");
    setBusy(true);
    try {
      await onConfirm();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function download() {
    if (!confirmed) return;
    setError("");
    setBusy(true);
    try {
      const [{ specificationPdf }, response] = await Promise.all([
        import("../lib/specification-pdf.js"),
        fetch("/fonts/Poppins-Regular.ttf"),
      ]);
      if (!response.ok)
        throw new Error("The PDF font could not load. Please retry.");
      const bytes = await specificationPdf(
        confirmed,
        new Uint8Array(await response.arrayBuffer()),
      );
      const url = URL.createObjectURL(
        new Blob([bytes], { type: "application/pdf" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = `configuration-${confirmed.id.slice(0, 12)}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
      setError("PDF could not be created. " + e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="configuration-review" aria-label="Review configuration">
      <div className="configuration-review-heading">
        <span className="eyebrow">
          {confirmed ? "03 / YOUR CONFIGURATION" : "02 / CHECK THE DETAILS"}
        </span>
        <h3>
          {confirmed
            ? "Confirmed. Ready to keep."
            : "Make sure it’s your design."}
        </h3>
        <p>
          {confirmed
            ? "Your download records this exact configuration. Changing inputs or the app will require a new confirmation."
            : "Review the values and specification before confirming. Your selections are preserved when you go back."}
        </p>
      </div>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <div className="configuration-review-grid">
        <div>
          <dl className="configuration-facts">
            <div>
              <dt>Model units</dt>
              <dd>
                {spec.units === "unspecified" ? "Not specified" : spec.units}
              </dd>
            </div>
            <div>
              <dt>Material</dt>
              <dd>{spec.material || "Not specified"}</dd>
            </div>
            <div>
              <dt>Connections</dt>
              <dd>{spec.connections || "Not specified"}</dd>
            </div>
          </dl>
          <table>
            <caption>Selected inputs</caption>
            <thead>
              <tr>
                <th>Parameter</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              {content.controls.map((c) => (
                <tr key={c.binding}>
                  <th scope="row">{c.label}</th>
                  <td>{String(c.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {spec.notes && <p>{spec.notes}</p>}
        </div>
        <div className="configuration-preview">
          {(confirmed?.preview || preview) && (
            <img
              src={confirmed?.preview || preview}
              alt="Model at the selected configuration"
            />
          )}
          <p className="fine">
            Perspective preview. The PDF records parameter values; it is not a
            dimensioned manufacturing drawing.
          </p>
          {content.assemblyRequested && (
            <p className="configuration-pending">
              Assembly documentation is still pending. Parts, joints, hardware
              and assembly order have not been verified.
            </p>
          )}
        </div>
      </div>
      {!ready && !confirmed && (
        <p className="notice">
          Generate an up-to-date model with these values before confirming.
        </p>
      )}
      {!confirmed && (
        <label className="ai-consent">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
            disabled={!ready || busy}
          />
          I have reviewed these values. This confirms a configuration, not
          manufacturing readiness.
        </label>
      )}
      {confirmed && (
        <p className="configuration-receipt">
          Revision {confirmed.revision} · Reference {confirmed.id.slice(0, 16)}
          <br />
          Confirmed {new Date(confirmed.confirmedAt).toLocaleString()} · Saved
          in this session
        </p>
      )}
      <div className="configuration-actions">
        <button className="button quiet" onClick={onBack} disabled={busy}>
          ← Back to configure
        </button>
        {!confirmed ? (
          <button
            className="button primary"
            disabled={!ready || !accepted || busy}
            onClick={confirm}
          >
            {busy ? "Confirming…" : "Confirm configuration ↗"}
          </button>
        ) : (
          pdfEnabled && (
            <button
              className="button primary"
              disabled={busy}
              onClick={download}
            >
              {busy ? "Preparing PDF…" : "Download specification PDF ↓"}
            </button>
          )
        )}
      </div>
    </section>
  );
}
