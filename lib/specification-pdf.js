import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

// Render only an immutable confirmation snapshot. No model call or remote URL fetch.
export async function specificationPdf(snapshot, fontBytes) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(fontBytes, { subset: true });
  pdf.setTitle(snapshot.title + " - configuration specification");
  pdf.setAuthor("Modolouge / ToolWorksLab");
  pdf.setCreationDate(new Date(snapshot.confirmedAt));
  const ink = rgb(0.09, 0.14, 0.11),
    muted = rgb(0.35, 0.4, 0.36);
  const hex = snapshot.brand.primary || "#44769b";
  const accent = rgb(
    ...hex
      .slice(1)
      .match(/../g)
      .map((s) => parseInt(s, 16) / 255),
  );
  let page, y;
  const clean = (s) =>
    String(s ?? "")
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
      .replace(/[\u2010-\u2015]/g, "-");
  function newPage() {
    page = pdf.addPage([595.28, 841.89]);
    y = 750;
    page.drawRectangle({
      x: 0,
      y: 805,
      width: 595.28,
      height: 37,
      color: accent,
    });
    page.drawText("MODOLOUGE / CONFIGURATION RECORD", {
      x: 42,
      y: 774,
      size: 9,
      font,
      color: muted,
    });
  }
  function lines(text, size, width) {
    const out = [];
    for (const paragraph of clean(text).split("\n")) {
      let line = "";
      for (const word of paragraph.split(/\s+/)) {
        if (
          font.widthOfTextAtSize(line ? line + " " + word : word, size) >
            width &&
          line
        ) {
          out.push(line);
          line = "";
        }
        if (line) line += " ";
        for (const char of word) {
          if (font.widthOfTextAtSize(line + char, size) > width && line) {
            out.push(line);
            line = "";
          }
          line += char;
        }
      }
      out.push(line);
    }
    return out;
  }
  function text(
    value,
    { size = 10, color = ink, gap = 8, x = 42, width = 510 } = {},
  ) {
    for (const line of lines(value, size, width)) {
      if (y < 70) newPage();
      page.drawText(line, { x, y, size, font, color });
      y -= size * 1.6;
    }
    y -= gap;
  }
  function section(title, minimumSpace = 130) {
    if (y < minimumSpace) newPage();
    y -= 10;
    text(title, { size: 14 });
  }
  newPage();
  if (snapshot.logo) {
    const image = snapshot.logo.startsWith("data:image/png")
      ? await pdf.embedPng(snapshot.logo)
      : await pdf.embedJpg(snapshot.logo);
    const size = image.scaleToFit(120, 42);
    page.drawImage(image, { x: 42, y: y - size.height, ...size });
    y -= size.height + 16;
  }
  if (snapshot.brand.name)
    text(snapshot.brand.name, { size: 11, color: muted });
  text(snapshot.title, { size: 25, gap: 12 });
  text("Confirmed configuration", { size: 14 });
  text(
    `Revision ${snapshot.revision} / Reference ${snapshot.id.slice(0, 16)}\nConfirmed ${snapshot.confirmedAt}`,
    { size: 9, color: muted },
  );
  text(snapshot.description, { size: 10 });
  if (snapshot.preview) {
    const image = await pdf.embedPng(snapshot.preview);
    const size = image.scaleToFit(510, 265);
    if (y - size.height < 85) newPage();
    page.drawImage(image, {
      x: 42 + (510 - size.width) / 2,
      y: y - size.height,
      ...size,
    });
    y -= size.height + 20;
    text(
      "Model view at confirmation. Perspective image; do not scale from this view.",
      { size: 8, color: muted },
    );
  }
  section("Specification");
  const spec = snapshot.specification;
  for (const [label, value] of [
    ["Units", spec.units === "unspecified" ? "Not specified" : spec.units],
    ["Material", spec.material || "Not specified"],
    ["Connections", spec.connections || "Not specified"],
  ])
    text(`${label}: ${value}`);
  if (spec.notes) text("Notes: " + spec.notes);
  section("Confirmed inputs", 220);
  text(
    "Values are recorded exactly as configured. Unit selection labels the document; it does not rescale the Grasshopper model.",
    { size: 9, color: muted },
  );
  for (const control of snapshot.controls) {
    if (y < 115) newPage();
    page.drawLine({
      start: { x: 42, y: y + 12 },
      end: { x: 552, y: y + 12 },
      thickness: 0.5,
      color: rgb(0.82, 0.85, 0.81),
    });
    text(
      `${control.label}: ${typeof control.value === "boolean" ? (control.value ? "Yes" : "No") : control.value}`,
      { size: 10, gap: 10 },
    );
  }
  section("Document scope");
  text(
    "This document records a configuration confirmed in the browser. It is not a signed approval, dimensioned manufacturing drawing, cut list or assembly instruction.",
  );
  if (snapshot.assemblyRequested)
    text(
      "Assembly documentation is still incomplete. Part identification, connection and hardware details, assembly sequence and a manufacturing review are required. No assembly steps have been invented.",
    );
  if (snapshot.brand.name || snapshot.brand.reference)
    text(
      "Brand settings were supplied or drafted in the app. Compliance with brand guidelines has not been independently verified.",
    );
  if (snapshot.brand.reference)
    text("Brand reference: " + snapshot.brand.reference, { size: 9 });
  pdf.getPages().forEach((p, i, pages) => {
    p.drawText(
      `CONFIGURATION ONLY  /  ${snapshot.id.slice(0, 12)}  /  ${i + 1} of ${pages.length}`,
      { x: 42, y: 32, size: 8, font, color: muted },
    );
  });
  return pdf.save();
}
