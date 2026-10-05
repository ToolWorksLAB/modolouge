"use client";
import { useEffect, useReducer, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  CATALOG,
  CONTAINERS,
  MAX_DESIGN_BYTES,
  element,
  initialDesign,
  definitionKey,
  flatten,
  findNode,
  isLocked,
  patchNode,
  insertNode,
  moveNode,
  removeNode,
  duplicateNode,
  validateDesign,
  boundControl,
  plotSeries,
  arrangeDesign,
} from "../lib/app-design.js";
import { api } from "../lib/client-api.js";
const Viewport = dynamic(() => import("./Viewport.jsx"), {
  ssr: false,
  loading: () => <div className="ad-empty">Opening viewport…</div>,
});
const MIME = "application/x-modolouge-element";
const empty = [];
function history(state, action) {
  if (action.type === "load")
    return { past: [], present: action.doc, future: [] };
  if (action.type === "undo" && state.past.length)
    return {
      past: state.past.slice(0, -1),
      present: state.past.at(-1),
      future: [state.present, ...state.future],
    };
  if (action.type === "redo" && state.future.length)
    return {
      past: [...state.past, state.present],
      present: state.future[0],
      future: state.future.slice(1),
    };
  if (action.type === "edit" && action.doc !== state.present)
    return {
      past: [...state.past.slice(-39), state.present],
      present: action.doc,
      future: [],
    };
  return state;
}
function QuickCustomize({ doc, rows, definition, edit, onAdvanced }) {
  const heading = rows.find(
    ({ node }) => node.type === "text" && node.textStyle === "heading",
  )?.node;
  const grid = rows.find(({ node }) => node.type === "grid")?.node;
  const controls = rows.filter(({ node }) =>
    ["slider", "ruler", "toggle", "textInput", "file"].includes(node.type),
  );
  const layout =
    grid?.columns === 1
      ? "stacked"
      : grid?.ratio === "wide-right"
        ? "side"
        : grid?.ratio === "equal"
          ? "balanced"
          : "";
  return (
    <aside className="ad-quick-panel" aria-label="Quick customization">
      <div className="ad-quick-intro">
        <span className="eyebrow">
          {definition ? "CONNECTED TO YOUR FILE" : "YOUR INTERFACE"}
        </span>
        <h2>Make it yours.</h2>
        <p className="ad-mobile-hint">
          Use Preview above to try your app at any time.
        </p>
        <p>
          {definition
            ? "Your model and controls are ready. Change only what you need."
            : "Arrange your interface now. Open its Grasshopper file when you want to try the controls."}
        </p>
      </div>
      <section>
        <h3>01 / The first impression</h3>
        {heading && (
          <Field
            label="App heading"
            value={heading.text}
            disabled={isLocked(doc, heading.id)}
            onCommit={(text) => edit((d) => patchNode(d, heading.id, { text }))}
          />
        )}
        <div className="ad-theme-choices" aria-label="App appearance">
          {["paper", "graphite"].map((theme) => (
            <button
              key={theme}
              aria-pressed={doc.theme === theme}
              onClick={() => edit({ ...doc, theme })}
            >
              <i className={theme} />
              {theme === "paper" ? "Paper" : "Graphite"}
            </button>
          ))}
        </div>
      </section>
      {grid && (
        <section>
          <h3>02 / The arrangement</h3>
          <div className="ad-arrangements" aria-label="Layout arrangement">
            {[
              ["side", "Model focus"],
              ["balanced", "Balanced"],
              ["stacked", "Stacked"],
            ].map(([id, label]) => (
              <button
                disabled={isLocked(doc, grid.id)}
                key={id}
                aria-pressed={layout === id}
                onClick={() => edit((d) => arrangeDesign(d, id))}
              >
                <span
                  className={"ad-layout-icon layout-" + id}
                  aria-hidden="true"
                >
                  <i />
                  <i />
                </span>
                {label}
              </button>
            ))}
          </div>
          <p className="ad-help">
            Your elements and connections stay in place.
          </p>
        </section>
      )}
      <section>
        <h3>03 / What people can change</h3>
        <p className="ad-help">
          Choose visible controls and give them familiar names.
        </p>
        <div className="ad-quick-inputs">
          {controls.map(({ node: n }) => (
            <div key={n.id} className="ad-quick-control">
              <label>
                <input
                  type="checkbox"
                  checked={!n.hidden}
                  disabled={isLocked(doc, n.id)}
                  onChange={(e) =>
                    edit((d) =>
                      patchNode(d, n.id, { hidden: !e.target.checked }),
                    )
                  }
                />
                <span>Show {n.label}</span>
              </label>
              <Field
                label={"Label for " + n.label}
                value={n.label}
                disabled={isLocked(doc, n.id)}
                onCommit={(label) => edit((d) => patchNode(d, n.id, { label }))}
              />
              {definition && !boundControl(n, definition) && (
                <small>
                  Unconnected — choose an input in the layout editor.
                </small>
              )}
            </div>
          ))}
        </div>
        {!controls.length && (
          <p className="ad-help">
            Open your Grasshopper file to add its controls automatically, or use
            the layout editor to connect an existing layout.
          </p>
        )}
      </section>
      <button className="ad-advanced-link" onClick={onAdvanced}>
        Add elements & edit layout ↗
      </button>
      <p className="ad-help">
        Sections, images, charts and precise arrangement live in the layout
        editor.
      </p>
    </aside>
  );
}
function download(doc) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(validateDesign(doc), null, 2)], {
      type: "application/json",
    }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download =
    (doc.title.replace(/[^a-z0-9_-]+/gi, "-") || "my-app") + ".modolouge.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function AppDesigner({
  definition,
  objects = empty,
  dataOutputs = empty,
  values,
  onValueChange,
  onRun,
  busy,
  canRun,
  member,
  accountKey = "",
  onSignIn,
  initialDocument,
  initialCloud,
  libraryRequest = 0,
  onChooseDefinition,
  runHint = "",
  authDismissed = 0,
  request = api,
}) {
  const [state, dispatch] = useReducer(history, null, () => ({
    past: [],
    present: initialDocument
      ? validateDesign(initialDocument)
      : initialDesign(definition),
    future: [],
  }));
  const doc = state.present;
  const [selected, setSelected] = useState(null),
    [editorMode, setEditorMode] = useState("quick"),
    [device, setDevice] = useState("desktop"),
    [query, setQuery] = useState(""),
    [message, setMessage] = useState(""),
    [saved, setSaved] = useState("Preparing draft…"),
    [ready, setReady] = useState(false),
    [library, setLibrary] = useState(null),
    [cloud, setCloud] = useState(initialCloud || null),
    [saving, setSaving] = useState(false);
  const [moving, setMoving] = useState(null);
  const importRef = useRef(),
    rootRef = useRef(),
    dragRef = useRef(null),
    pointerDrag = useRef(null),
    suppressClick = useRef(false),
    pendingAuth = useRef(null),
    seenLibraryRequest = useRef(0),
    previousMember = useRef(member),
    previousDismiss = useRef(authDismissed);
  const libraryRef = useRef(null);
  const freshCloudDraft = useRef(!!initialDocument && !initialCloud);
  const preview = editorMode !== "advanced";
  const localKey = "modolouge:app:" + definitionKey(definition);
  const cloudKey = localKey + ":account:" + accountKey;
  const freshKey = localKey + ":fresh";
  function rememberCloud(value) {
    setCloud(value ? { ...value, accountKey } : null);
    freshCloudDraft.current = !value;
    try {
      if (value) {
        localStorage.setItem(cloudKey, JSON.stringify(value));
        localStorage.removeItem(freshKey);
      } else {
        localStorage.removeItem(cloudKey);
        localStorage.setItem(freshKey, "1");
      }
    } catch {}
  }
  const item = findNode(doc, selected),
    node = item?.node;
  const locked = isLocked(doc, selected);
  useEffect(() => {
    try {
      const stored = localStorage.getItem(localKey);
      if (!initialCloud && localStorage.getItem(freshKey))
        freshCloudDraft.current = true;
      if (stored && !initialDocument)
        dispatch({ type: "load", doc: validateDesign(JSON.parse(stored)) });
    } catch {
      setMessage(
        "The saved draft could not be opened. You can still import a layout file.",
      );
    }
    setReady(true);
  }, [localKey]);
  useEffect(() => {
    if (!libraryRequest) {
      seenLibraryRequest.current = 0;
      return;
    }
    if (libraryRequest && libraryRequest !== seenLibraryRequest.current) {
      seenLibraryRequest.current = libraryRequest;
      openLibrary();
    }
  }, [libraryRequest]);
  useEffect(() => {
    const signedIn = member && !previousMember.current;
    previousMember.current = member;
    if (!signedIn || !pendingAuth.current) return;
    const action = pendingAuth.current;
    pendingAuth.current = null;
    if (action === "save") saveCloud();
    else openLibrary();
  }, [member, accountKey]);
  useEffect(() => {
    if (previousDismiss.current !== authDismissed) pendingAuth.current = null;
    previousDismiss.current = authDismissed;
  }, [authDismissed]);
  useEffect(() => {
    if (!library) return;
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    libraryRef.current?.querySelector("button")?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setLibrary(null);
      }
      if (e.key !== "Tab") return;
      const nodes = [
        ...libraryRef.current.querySelectorAll("button:not(:disabled)"),
      ];
      if (e.shiftKey && document.activeElement === nodes[0]) {
        e.preventDefault();
        nodes.at(-1)?.focus();
      } else if (!e.shiftKey && document.activeElement === nodes.at(-1)) {
        e.preventDefault();
        nodes[0]?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, [Boolean(library)]);
  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(localKey, JSON.stringify(doc));
        setSaved("Draft saved on this device");
      } catch {
        setSaved("Device storage full — export your layout");
      }
    }, 450);
    return () => clearTimeout(timer);
  }, [doc, localKey, ready]);
  const edit = (fn) => {
    try {
      dispatch({
        type: "edit",
        doc: typeof fn === "function" ? fn(doc) : validateDesign(fn),
      });
      setMessage("");
    } catch (e) {
      setMessage(e.message);
    }
  };
  const update = (patch) => edit((d) => patchNode(d, selected, patch));
  function add(type, parent = undefined, index = Infinity) {
    const n = element(type);
    if (parent === undefined)
      parent =
        node && CONTAINERS.has(node.type) ? node.id : item?.parent || null;
    try {
      const next = insertNode(doc, n, parent, index);
      edit(next);
      setSelected(n.id);
    } catch (e) {
      setMessage(e.message);
    }
  }
  function drop(e, parent, index) {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.remove("ad-over");
    try {
      const data = JSON.parse(e.dataTransfer.getData(MIME) || "null");
      if (!data) return;
      if (data.type) add(data.type, parent, index);
      else if (data.id) edit((d) => moveNode(d, data.id, parent, index));
    } catch {
      setMessage("Drop a toolbox element or an existing layer here.");
    }
    dragRef.current = null;
  }
  function dragStart(e, data) {
    dragRef.current = data;
    e.dataTransfer.setData(MIME, JSON.stringify(data));
    e.dataTransfer.effectAllowed = "copyMove";
    e.stopPropagation();
  }
  function pointerStart(e, data) {
    if (e.button !== 0 || preview) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    pointerDrag.current = {
      data,
      x: e.clientX,
      y: e.clientY,
      moved: false,
      target: null,
    };
  }
  function pointerMove(e) {
    const drag = pointerDrag.current;
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6)
      return;
    drag.moved = true;
    const target = document
      .elementFromPoint(e.clientX, e.clientY)
      ?.closest("[data-ad-drop]");
    if (drag.target !== target) {
      drag.target?.classList.remove("ad-over");
      target?.classList.add("ad-over");
      drag.target = target;
    }
    setMoving({
      x: e.clientX,
      y: e.clientY,
      label: drag.data.type
        ? CATALOG.find((t) => t.type === drag.data.type)?.label
        : findNode(doc, drag.data.id)?.node.label,
    });
  }
  function pointerEnd(e, cancel = false) {
    const drag = pointerDrag.current;
    if (!drag) return;
    pointerDrag.current = null;
    setMoving(null);
    drag.target?.classList.remove("ad-over");
    if (drag.moved) {
      suppressClick.current = true;
      setTimeout(() => {
        suppressClick.current = false;
      }, 0);
      if (!cancel && drag.target && rootRef.current?.contains(drag.target)) {
        const parent = drag.target.dataset.adParent || null,
          index = Number(drag.target.dataset.adIndex);
        if (drag.data.type) add(drag.data.type, parent, index);
        else edit((d) => moveNode(d, drag.data.id, parent, index));
      }
    }
  }
  const dropProps = (parent, index) => ({
    "data-ad-drop": "true",
    "data-ad-parent": parent || "",
    "data-ad-index": index,
    onDragOver: (e) => {
      if (Array.from(e.dataTransfer.types).includes(MIME)) {
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.classList.add("ad-over");
      }
    },
    onDragLeave: (e) => e.currentTarget.classList.remove("ad-over"),
    onDrop: (e) => drop(e, parent, index),
  });
  function reorder(delta) {
    if (!item) return;
    const siblings = item.parent
      ? findNode(doc, item.parent).node.children
      : doc.nodes;
    const i = siblings.findIndex((n) => n.id === selected);
    if (i + delta < 0 || i + delta >= siblings.length) return;
    edit((d) =>
      moveNode(d, selected, item.parent, i + delta + (delta > 0 ? 1 : 0)),
    );
  }
  function keyDown(e) {
    if (e.key === "Escape" && pointerDrag.current) {
      e.preventDefault();
      pointerEnd(e, true);
      return;
    }
    if (
      preview ||
      library ||
      e.target.closest("input,textarea,select,[contenteditable=true]")
    )
      return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      dispatch({ type: e.shiftKey ? "redo" : "undo" });
    } else if (
      (e.ctrlKey || e.metaKey) &&
      e.key.toLowerCase() === "d" &&
      selected
    ) {
      e.preventDefault();
      edit((d) => duplicateNode(d, selected));
    } else if (e.key === "Delete" && selected) {
      e.preventDefault();
      edit((d) => removeNode(d, selected));
    } else if (e.altKey && ["ArrowUp", "ArrowDown"].includes(e.key)) {
      e.preventDefault();
      reorder(e.key === "ArrowUp" ? -1 : 1);
    }
  }
  async function importFile(file) {
    if (!file) return;
    try {
      if (file.size > MAX_DESIGN_BYTES)
        throw new Error("Choose a layout file below 900 KB.");
      const next = validateDesign(JSON.parse(await file.text()));
      edit(next);
      setSelected(null);
      rememberCloud(null);
    } catch (e) {
      setMessage(
        e instanceof SyntaxError
          ? "This file is not a Modolouge JSON layout."
          : e.message,
      );
    }
  }
  async function uploadImage(file) {
    if (!file) return;
    if (
      file.size > 250000 ||
      !["image/png", "image/jpeg", "image/webp"].includes(file.type)
    ) {
      setMessage("Choose a PNG, JPEG or WebP below 250 KB.");
      return;
    }
    const target = selected;
    const reader = new FileReader();
    reader.onload = () =>
      edit((d) => patchNode(d, target, { image: reader.result }));
    reader.readAsDataURL(file);
  }
  async function openLibrary() {
    if (!member) {
      pendingAuth.current = "library";
      onSignIn?.("library");
      return;
    }
    setSaving(true);
    try {
      setLibrary((await request("designs")).designs);
    } catch (e) {
      setMessage(e.message);
    } finally {
      setSaving(false);
    }
  }
  async function saveCloud() {
    if (!member) {
      pendingAuth.current = "save";
      onSignIn?.("save");
      return;
    }
    setSaving(true);
    try {
      const list = (await request("designs")).designs;
      let reference = cloud?.accountKey === accountKey ? cloud : null;
      if (!reference && !freshCloudDraft.current) {
        try {
          const cached = JSON.parse(localStorage.getItem(cloudKey));
          if (
            cached &&
            Number.isInteger(cached.slot) &&
            cached.slot >= 1 &&
            cached.slot <= 20 &&
            typeof cached.revision === "string"
          )
            reference = cached;
        } catch {}
      }
      const slot =
        reference?.slot ||
        Array.from({ length: 20 }, (_, i) => i + 1).find(
          (s) => !list.some((d) => d.slot === s),
        );
      if (!slot)
        throw new Error(
          "Your 20 account slots are full. Open a saved app to update it, or export a layout file.",
        );
      const next = await request("designs", {
        slot,
        revision: reference?.revision || null,
        document: doc,
      });
      rememberCloud(next);
      setMessage(
        "Saved privately to your account. The layout does not include the Grasshopper file.",
      );
    } catch (e) {
      setMessage(e.message);
    } finally {
      setSaving(false);
    }
  }
  async function loadCloud(slot) {
    setSaving(true);
    try {
      const result = await request("designs?slot=" + slot);
      edit(result.document);
      rememberCloud({ slot, revision: result.revision });
      setSelected(null);
      setLibrary(null);
    } catch (e) {
      setMessage(e.message);
    } finally {
      setSaving(false);
    }
  }
  function renderNodes(nodes, parent = null) {
    return (
      <>
        {nodes.map((n, index) =>
          preview && n.hidden ? null : (
            <div key={n.id} className="ad-slot" style={{ "--ad-span": n.span }}>
              {!preview && (
                <div className="ad-insert" {...dropProps(parent, index)}>
                  <span>Insert here</span>
                </div>
              )}
              <DesignNode
                node={n}
                selected={selected === n.id}
                preview={preview}
                locked={isLocked(doc, n.id)}
                onSelect={() => setSelected(n.id)}
                dragStart={dragStart}
                pointerStart={pointerStart}
                dropProps={dropProps}
                renderNodes={renderNodes}
                onResize={(height) =>
                  edit((d) => patchNode(d, n.id, { height }))
                }
                definition={definition}
                objects={objects}
                dataOutputs={dataOutputs}
                values={values}
                onValueChange={onValueChange}
                onRun={onRun}
                busy={busy}
                canRun={canRun}
              />
            </div>
          ),
        )}
        {!preview && (
          <div
            className="ad-insert ad-insert-end"
            {...dropProps(parent, nodes.length)}
          >
            <span>
              {nodes.length ? "Drop to append" : "Drop an element here"}
            </span>
          </div>
        )}
      </>
    );
  }
  const rows = flatten(doc.nodes);
  const matching = new Set(
    rows
      .filter((x) => x.node.label.toLowerCase().includes(query.toLowerCase()))
      .map((x) => x.node.id),
  );
  for (const row of rows.filter((x) => matching.has(x.node.id))) {
    let p = row.parent;
    while (p) {
      matching.add(p);
      p = findNode(doc, p)?.parent;
    }
  }
  return (
    <section
      className={
        "app-designer " +
        (preview ? "ad-preview " : "") +
        (editorMode === "quick" ? "ad-quick" : "")
      }
      ref={rootRef}
      onKeyDown={keyDown}
      onPointerMove={pointerMove}
      onPointerUp={pointerEnd}
      onPointerCancel={(e) => pointerEnd(e, true)}
      onLostPointerCapture={(e) => pointerEnd(e, true)}
      onClickCapture={(e) => {
        if (suppressClick.current) {
          e.preventDefault();
          e.stopPropagation();
          suppressClick.current = false;
        }
      }}
      aria-label="Application designer"
    >
      <div className="ad-toolbar">
        <div className="ad-identity">
          <span className="ad-mark">▧</span>
          <div>
            <span className="eyebrow">APPLICATION STUDIO</span>
            <input
              aria-label="Application title"
              key={doc.title}
              defaultValue={doc.title}
              maxLength={160}
              onBlur={(e) => {
                if (e.target.value !== doc.title)
                  edit({ ...doc, title: e.target.value });
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
            />
          </div>
        </div>
        <div className="ad-mode" aria-label="Studio mode">
          {[
            ["quick", "Customize"],
            ["advanced", "Layout editor"],
            ["preview", "Preview"],
          ].map(([id, label]) => (
            <button
              key={id}
              aria-pressed={editorMode === id}
              onClick={() => setEditorMode(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="ad-actions">
          <button
            disabled={!state.past.length}
            onClick={() => dispatch({ type: "undo" })}
            title="Undo (Ctrl+Z)"
            aria-label="Undo"
          >
            ↶
          </button>
          <button
            disabled={!state.future.length}
            onClick={() => dispatch({ type: "redo" })}
            title="Redo (Ctrl+Shift+Z)"
            aria-label="Redo"
          >
            ↷
          </button>
          <details className="ad-file-menu">
            <summary>Files</summary>
            <div>
              <button onClick={() => download(doc)}>Export layout</button>
              <button onClick={() => importRef.current.click()}>
                Import layout
              </button>
              <button disabled={saving} onClick={openLibrary}>
                Saved layouts
              </button>
              <p>Layouts contain the interface, not the Grasshopper file.</p>
            </div>
          </details>
          <button disabled={saving} onClick={saveCloud} className="ad-save">
            {saving ? "Saving…" : "Save to account"}
          </button>
        </div>
      </div>
      {!definition && (
        <div className="ad-note">
          <span>
            {doc.definitionName
              ? `Open ${doc.definitionName} to reconnect this layout’s controls and geometry.`
              : "Open a Grasshopper file to connect this layout to a model."}
          </span>
          {onChooseDefinition && (
            <button onClick={() => onChooseDefinition(doc, cloud)}>
              Choose file ↥
            </button>
          )}
        </div>
      )}
      {definition && doc.definitionKey !== definitionKey(definition) && (
        <div className="ad-note">
          This layout was made for {doc.definitionName || "another definition"}.
          {onChooseDefinition && (
            <button onClick={() => onChooseDefinition(doc, cloud)}>
              Choose matching file ↥
            </button>
          )}{" "}
          Or reconnect inputs in the layout editor.
        </div>
      )}
      <div className="ad-workbench">
        {editorMode === "quick" && (
          <QuickCustomize
            doc={doc}
            rows={rows}
            definition={definition}
            edit={edit}
            onAdvanced={() => setEditorMode("advanced")}
          />
        )}
        {!preview && (
          <aside className="ad-toolbox">
            <div className="ad-panel-title">
              <span>01 / TOOLBOX</span>
              <span>14 elements</span>
            </div>
            <p className="ad-help">
              Drag onto the canvas.
              <br />
              Click to add to a selected group.
            </p>
            {["Layout", "Inputs", "Outputs"].map((group) => (
              <div className="ad-tool-group" key={group}>
                <h3>{group}</h3>
                {CATALOG.filter((t) => t.group === group && !t.native).map(
                  (t) => (
                    <button
                      key={t.type}
                      className={t.native ? "ad-native" : ""}
                      aria-disabled={!!t.native}
                      draggable={false}
                      onPointerDown={(e) => {
                        if (!t.native) pointerStart(e, { type: t.type });
                      }}
                      onDragStart={(e) => dragStart(e, { type: t.type })}
                      onClick={() =>
                        t.native ? setMessage(t.hint) : add(t.type)
                      }
                      title={t.hint}
                    >
                      <span className="ad-tool-icon">{t.icon}</span>
                      <span>{t.label}</span>
                      {t.native && <small>Native</small>}
                    </button>
                  ),
                )}
              </div>
            ))}
            <div className="ad-tool-footer">
              <button onClick={() => importRef.current.click()}>
                Import layout ↥
              </button>
              <button disabled={saving} onClick={openLibrary}>
                Saved layouts ↗
              </button>
              <p>
                .modolouge.json · layout only
                <br />
                Native .chapulines files need migration.
              </p>
            </div>
          </aside>
        )}
        <div className="ad-stage">
          <div className="ad-stage-bar">
            <span>{preview ? "YOUR APP" : "APPLICATION CANVAS"}</span>
            <div className="ad-devices" aria-label="Preview size">
              {[
                ["desktop", "Wide"],
                ["tablet", "Tablet"],
                ["phone", "Phone"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  aria-pressed={device === id}
                  onClick={() => setDevice(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            <span>
              {preview
                ? runHint || "TRY THE CONTROLS"
                : "SELECT / ARRANGE / CONNECT"}
            </span>
          </div>
          <div className="ad-stage-scroll">
            <div
              className={"ad-artboard ad-" + device + " ad-theme-" + doc.theme}
            >
              <div className="ad-app-brand">
                <span>
                  modolouge<span className="pink">.</span>
                </span>
                <span>PARAMETRIC APPLICATION / 01</span>
              </div>
              <div
                className="ad-root-layout"
                {...(!preview ? dropProps(null, doc.nodes.length) : {})}
              >
                {renderNodes(doc.nodes)}
              </div>
              <div className="ad-app-footer">
                <span>{definition?.filename || "No definition connected"}</span>
                <span>
                  {busy ||
                    (preview
                      ? "Adjust → update → explore"
                      : "LAYOUT EDITING IS FREE")}
                </span>
              </div>
            </div>
          </div>
          <div className="ad-status">
            <span>
              <i />
              {saved}
            </span>
            <span>
              {rows.length} elements · {definition?.controls.length || 0}{" "}
              available inputs
            </span>
          </div>
        </div>
        {!preview && (
          <aside className="ad-properties">
            <div className="ad-panel-title">
              <span>02 / LAYERS</span>
              <span>{rows.length}</span>
            </div>
            <input
              className="ad-search"
              aria-label="Search layers"
              placeholder="Find an element…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div
              className="ad-layers"
              role="list"
              aria-label="Application layers"
            >
              {rows
                .filter((x) => matching.has(x.node.id))
                .map(({ node: n, depth, parent }) => (
                  <div
                    key={n.id}
                    role="listitem"
                    className={
                      "ad-layer " + (selected === n.id ? "selected" : "")
                    }
                    {...(CONTAINERS.has(n.type)
                      ? dropProps(n.id, n.children.length)
                      : {})}
                  >
                    <button
                      style={{ paddingLeft: 12 + depth * 12 }}
                      aria-pressed={selected === n.id}
                      draggable={false}
                      onPointerDown={(e) => {
                        if (!isLocked(doc, n.id)) pointerStart(e, { id: n.id });
                      }}
                      onDragStart={(e) => dragStart(e, { id: n.id })}
                      onClick={() => setSelected(n.id)}
                    >
                      <span>
                        {CATALOG.find((t) => t.type === n.type)?.icon}
                      </span>
                      <span className={n.hidden ? "ad-dim" : ""}>
                        {n.label}
                      </span>
                      {n.locked && <small>●</small>}
                    </button>
                    <button
                      aria-label={(n.hidden ? "Show " : "Hide ") + n.label}
                      disabled={isLocked(doc, n.id)}
                      onClick={() =>
                        edit((d) => patchNode(d, n.id, { hidden: !n.hidden }))
                      }
                    >
                      {n.hidden ? "○" : "◉"}
                    </button>
                  </div>
                ))}
            </div>
            <div className="ad-panel-title">
              <span>03 / INSPECTOR</span>
              <button onClick={() => setSelected(null)}>App settings</button>
            </div>
            <div className="ad-inspector">
              {node ? (
                <>
                  <div className="ad-inspector-heading">
                    <span className="ad-tool-icon">
                      {CATALOG.find((t) => t.type === node.type)?.icon}
                    </span>
                    <div>
                      <h3>{node.label}</h3>
                      <small>
                        {CATALOG.find((t) => t.type === node.type)?.label}
                      </small>
                    </div>
                  </div>
                  <label className="ad-check">
                    <input
                      type="checkbox"
                      checked={node.locked}
                      disabled={!!item.parent && isLocked(doc, item.parent)}
                      onChange={(e) => update({ locked: e.target.checked })}
                    />
                    Lock element and children
                  </label>
                  <fieldset disabled={locked} key={node.id}>
                    <Field
                      label="Label"
                      value={node.label}
                      onCommit={(label) => update({ label })}
                    />
                    {node.type === "text" && (
                      <>
                        <Field
                          label="Content"
                          value={node.text}
                          multiline
                          onCommit={(text) => update({ text })}
                        />
                        <Select
                          label="Text style"
                          value={node.textStyle || "body"}
                          options={[
                            ["body", "Body"],
                            ["heading", "Heading"],
                          ]}
                          onChange={(textStyle) => update({ textStyle })}
                        />
                      </>
                    )}
                    {[
                      "slider",
                      "ruler",
                      "toggle",
                      "textInput",
                      "file",
                    ].includes(node.type) && (
                      <>
                        <Select
                          label="Grasshopper input"
                          value={node.binding || ""}
                          options={[
                            ["", "Choose an input…"],
                            ...(definition?.controls || [])
                              .filter((c) =>
                                ["slider", "ruler"].includes(node.type)
                                  ? c.kind === "number"
                                  : node.type === "toggle"
                                    ? c.kind === "boolean"
                                    : c.kind === "text",
                              )
                              .map((c) => [c.instanceId || c.name, c.label]),
                          ]}
                          onChange={(binding) => update({ binding })}
                        />
                        <p className="ad-help">
                          {node.type === "file"
                            ? "Text content up to 10 KB. Local file paths never reach the server."
                            : node.type === "textInput"
                              ? "Only unwired Panels are editable inputs."
                              : "Input range and precision come from the Grasshopper definition."}
                        </p>
                        {["slider", "ruler"].includes(node.type) && (
                          <Field
                            label="Display unit"
                            value={node.unit || ""}
                            onCommit={(unit) => update({ unit })}
                          />
                        )}
                      </>
                    )}
                    {["value", "chart"].includes(node.type) && (
                      <>
                        <Select
                          label="Data source"
                          value={node.source || ""}
                          options={[
                            ["", "Choose a source…"],
                            ...(node.type === "value"
                              ? (definition?.controls || []).map((c) => [
                                  "input:" + (c.instanceId || c.name),
                                  "Input · " + c.label,
                                ])
                              : []),
                            ...outputOptions(definition, dataOutputs).map(
                              (o) => [
                                "output:" + o.name,
                                "Output · " + o.label,
                              ],
                            ),
                          ]}
                          onChange={(source) => update({ source })}
                        />
                        <p className="ad-help">
                          Outputs refresh after Update geometry. Quick graph
                          uses numeric output items; gaps stay visible.
                        </p>
                      </>
                    )}
                    {node.type === "button" && (
                      <p className="ad-help">
                        Runs the connected definition with current values. Each
                        successful solve uses one run. This web button is not a
                        native momentary Boolean input.
                      </p>
                    )}
                    {node.type === "image" && (
                      <>
                        <label className="ad-field">
                          Image
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            onChange={(e) => {
                              uploadImage(e.target.files[0]);
                              e.target.value = "";
                            }}
                          />
                        </label>
                        <Field
                          label="Image description"
                          value={node.text}
                          onCommit={(text) => update({ text })}
                        />
                        <Select
                          label="Image fit"
                          value={node.fit || "contain"}
                          options={[
                            ["contain", "Contain"],
                            ["cover", "Cover"],
                          ]}
                          onChange={(fit) => update({ fit })}
                        />
                      </>
                    )}
                    {CONTAINERS.has(node.type) && (
                      <>
                        <div className="ad-field-row">
                          <NumberField
                            label="Gap"
                            value={node.gap}
                            max={64}
                            onCommit={(gap) => update({ gap })}
                          />
                          <NumberField
                            label="Padding"
                            value={node.padding}
                            max={64}
                            onCommit={(padding) => update({ padding })}
                          />
                        </div>
                        {node.type === "stack" && (
                          <Select
                            label="Direction"
                            value={node.direction}
                            options={[
                              ["vertical", "Vertical"],
                              ["horizontal", "Horizontal · wraps"],
                            ]}
                            onChange={(direction) => update({ direction })}
                          />
                        )}{" "}
                        {node.type === "grid" && (
                          <>
                            <Select
                              label="Columns"
                              value={String(node.columns)}
                              options={[
                                ["1", "One"],
                                ["2", "Two"],
                                ["3", "Three"],
                              ]}
                              onChange={(columns) =>
                                update({ columns: +columns })
                              }
                            />
                            {node.columns === 2 && (
                              <Select
                                label="Proportions"
                                value={node.ratio}
                                options={[
                                  ["equal", "1 : 1"],
                                  ["wide-right", "1 : 2"],
                                  ["wide-left", "2 : 1"],
                                ]}
                                onChange={(ratio) => update({ ratio })}
                              />
                            )}
                            <p className="ad-help">
                              Columns stack on narrow canvases. Changing tracks
                              keeps every child.
                            </p>
                          </>
                        )}
                      </>
                    )}
                    <div className="ad-field-row">
                      <NumberField
                        label="Min. height"
                        value={node.height}
                        max={1000}
                        onCommit={(height) => update({ height })}
                      />
                      <NumberField
                        label="Column span"
                        value={node.span}
                        min={1}
                        max={3}
                        onCommit={(span) => update({ span })}
                      />
                    </div>
                    <Select
                      label="Parent group"
                      value={item.parent || "root"}
                      options={[
                        ["root", "Application root"],
                        ...rows
                          .filter(
                            (x) =>
                              CONTAINERS.has(x.node.type) &&
                              !flatten([node]).some(
                                (y) => y.node.id === x.node.id,
                              ) &&
                              !isLocked(doc, x.node.id),
                          )
                          .map((x) => [x.node.id, x.node.label]),
                      ]}
                      onChange={(parent) =>
                        edit((d) =>
                          moveNode(
                            d,
                            node.id,
                            parent === "root" ? null : parent,
                          ),
                        )
                      }
                    />
                    <div className="ad-edit-actions">
                      <button onClick={() => reorder(-1)}>↑ Up</button>
                      <button onClick={() => reorder(1)}>↓ Down</button>
                      <button
                        onClick={() => edit((d) => duplicateNode(d, selected))}
                      >
                        Duplicate
                      </button>
                      <button
                        className="ad-delete"
                        onClick={() => edit((d) => removeNode(d, selected))}
                      >
                        Delete
                      </button>
                    </div>
                  </fieldset>
                </>
              ) : (
                <>
                  <h3>
                    A canvas for your logic<span className="pink">.</span>
                  </h3>
                  <p className="ad-help">
                    Select an element to change its layout, content or
                    Grasshopper binding.
                  </p>
                  <Select
                    label="Application theme"
                    value={doc.theme}
                    options={[
                      ["paper", "Paper"],
                      ["graphite", "Graphite"],
                    ]}
                    onChange={(theme) => edit({ ...doc, theme })}
                  />
                  <p className="ad-help">
                    Sections keep related controls together. Stacks flow. Grids
                    divide the available space.
                  </p>
                  <div className="ad-shortcuts">
                    <span>
                      Undo <kbd>Ctrl Z</kbd>
                    </span>
                    <span>
                      Duplicate <kbd>Ctrl D</kbd>
                    </span>
                    <span>
                      Reorder <kbd>Alt ↑ ↓</kbd>
                    </span>
                    <span>
                      Remove <kbd>Delete</kbd>
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      edit(initialDesign(definition));
                      setSelected(null);
                      rememberCloud(null);
                    }}
                  >
                    Start a fresh layout
                  </button>
                  <p className="ad-help">
                    Your existing layout remains available in Undo.
                  </p>
                </>
              )}
            </div>
          </aside>
        )}
      </div>
      <input
        type="file"
        accept=".json,.modolouge.json"
        ref={importRef}
        hidden
        onChange={(e) => {
          importFile(e.target.files[0]);
          e.target.value = "";
        }}
      />
      {moving && (
        <div
          className="ad-drag-ghost"
          style={{ left: moving.x + 14, top: moving.y + 14 }}
        >
          {moving.label}
        </div>
      )}
      {message && (
        <div className="ad-message" role="status">
          <span>{message}</span>
          <button aria-label="Dismiss message" onClick={() => setMessage("")}>
            ×
          </button>
        </div>
      )}
      {library && (
        <div
          className="ad-library"
          ref={libraryRef}
          role="dialog"
          aria-modal="true"
          aria-label="Saved layouts"
        >
          <div>
            <div className="ad-panel-title">
              <span>YOUR SAVED LAYOUTS</span>
              <button onClick={() => setLibrary(null)}>Close ×</button>
            </div>
            <p>
              Private layouts in your account. Reopen the matching Grasshopper
              file to run them.
            </p>
            {library.length ? (
              library.map((d) => (
                <button
                  className="ad-library-item"
                  key={d.slot}
                  disabled={saving}
                  onClick={() => loadCloud(d.slot)}
                >
                  <strong>{d.title}</strong>
                  <span>
                    {d.definition_name || "No definition"} ·{" "}
                    {new Date(d.updated_at).toLocaleDateString()} ↗
                  </span>
                </button>
              ))
            ) : (
              <p>No saved apps yet. Use Save to account to keep this one.</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
function Field({ label, value, onCommit, multiline, disabled = false }) {
  const Tag = multiline ? "textarea" : "input";
  return (
    <label className="ad-field">
      {label}
      <Tag
        key={String(value)}
        defaultValue={value}
        disabled={disabled}
        maxLength={multiline ? 5000 : 160}
        onBlur={(e) => {
          if (e.target.value !== value) onCommit(e.target.value);
        }}
        onKeyDown={(e) => {
          if (!multiline && e.key === "Enter") e.currentTarget.blur();
        }}
      />
    </label>
  );
}
function NumberField({ label, value, onCommit, min = 0, max }) {
  return (
    <label className="ad-field">
      {label}
      <input
        type="number"
        key={value}
        defaultValue={value}
        min={min}
        max={max}
        onBlur={(e) => {
          const v = e.target.valueAsNumber;
          if (Number.isFinite(v)) onCommit(Math.max(min, Math.min(max, v)));
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
      />
    </label>
  );
}
function Select({ label, value, options, onChange }) {
  return (
    <label className="ad-field">
      {label}
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map(([v, t]) => (
          <option key={v} value={v}>
            {t}
          </option>
        ))}
      </select>
    </label>
  );
}
function outputOptions(definition, data) {
  const map = new Map();
  for (const o of definition?.outputs || []) {
    const name = o.Name || o.name;
    if (name)
      map.set(name, {
        name,
        label: (o.NickName || name)
          .replace(/^RH_OUT:/, "")
          .replace(/_[a-f0-9]{8}$/i, ""),
      });
  }
  for (const o of data)
    map.set(o.name, {
      name: o.name,
      label: o.name.replace(/^RH_OUT:/, "").replace(/_[a-f0-9]{8}$/i, ""),
    });
  return [...map.values()];
}
function sourceValues(node, definition, values, data) {
  if (node.source?.startsWith("input:")) {
    const c = definition?.controls.find(
      (c) => (c.instanceId || c.name) === node.source.slice(6),
    );
    return c ? { items: [values[c.name]], live: true } : null;
  }
  if (node.source?.startsWith("output:"))
    return data.find((d) => d.name === node.source.slice(7)) || null;
  return null;
}
function DesignNode({
  node: n,
  selected,
  preview,
  locked,
  onSelect,
  dragStart,
  pointerStart,
  dropProps,
  renderNodes,
  onResize,
  ...runtime
}) {
  const frame = useRef(),
    resizing = useRef(null);
  const container = CONTAINERS.has(n.type);
  const style = {
    minHeight: n.height || undefined,
    "--ad-gap": n.gap + "px",
    "--ad-padding": n.padding + "px",
    "--ad-columns": n.columns,
    "--ad-tracks":
      n.columns === 2
        ? n.ratio === "wide-right"
          ? "minmax(0,1fr) minmax(0,2fr)"
          : n.ratio === "wide-left"
            ? "minmax(0,2fr) minmax(0,1fr)"
            : "repeat(2,minmax(0,1fr))"
        : `repeat(${n.columns},minmax(0,1fr))`,
  };
  if (preview && n.hidden) return null;
  function stopResize(e, cancel = false) {
    const start = resizing.current;
    if (!start) return;
    resizing.current = null;
    frame.current.style.minHeight = start.original;
    if (!cancel) onResize(start.height);
    if (e.currentTarget.hasPointerCapture?.(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
  }
  return (
    <div
      ref={frame}
      style={style}
      className={
        "ad-node ad-node-" +
        n.type +
        (selected && !preview ? " ad-selected" : "") +
        (n.hidden ? " ad-is-hidden" : "") +
        (locked ? " ad-is-locked" : "")
      }
      onClick={(e) => {
        if (!preview) {
          e.stopPropagation();
          onSelect();
        }
      }}
    >
      {!preview && (
        <div
          className="ad-node-bar"
          draggable={false}
          onPointerDown={(e) => {
            if (!locked) pointerStart(e, { id: n.id });
          }}
          onDragStart={(e) => dragStart(e, { id: n.id })}
        >
          <span>⠿ {n.label}</span>
          <span>{locked ? "LOCKED" : n.type.toUpperCase()}</span>
        </div>
      )}
      {container ? (
        <>
          <div className="ad-section-title">
            {n.type === "section" ? n.label : null}
          </div>
          <div
            className={
              "ad-children ad-children-" + n.type + " ad-flow-" + n.direction
            }
            {...(!preview ? dropProps(n.id, n.children.length) : {})}
          >
            {renderNodes(n.children, n.id)}
          </div>
        </>
      ) : (
        <ElementContent node={n} preview={preview} {...runtime} />
      )}
      {!preview && selected && !locked && (
        <button
          className="ad-resize"
          aria-label="Resize element height"
          title="Drag to change minimum height; use Inspector for exact sizing"
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onSelect();
            e.currentTarget.setPointerCapture(e.pointerId);
            resizing.current = {
              y: e.clientY,
              height: frame.current.getBoundingClientRect().height,
              start: frame.current.getBoundingClientRect().height,
              original: frame.current.style.minHeight,
            };
          }}
          onPointerMove={(e) => {
            if (resizing.current) {
              const r = resizing.current;
              r.height = Math.round(
                Math.max(40, Math.min(1000, r.start + e.clientY - r.y)),
              );
              frame.current.style.minHeight = r.height + "px";
            }
          }}
          onPointerUp={(e) => stopResize(e)}
          onPointerCancel={(e) => stopResize(e, true)}
          onLostPointerCapture={(e) => stopResize(e, true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") stopResize(e, true);
          }}
        />
      )}
    </div>
  );
}
function ElementContent({
  node: n,
  preview,
  definition,
  objects,
  dataOutputs,
  values,
  onValueChange,
  onRun,
  busy,
  canRun,
}) {
  const control = boundControl(n, definition);
  const source = sourceValues(n, definition, values, dataOutputs);
  if (n.type === "text")
    return (
      <div className={"ad-copy ad-copy-" + n.textStyle}>
        {n.text || "Add some text in the Inspector."}
      </div>
    );
  if (n.type === "image")
    return n.image ? (
      <img
        className="ad-image"
        src={n.image}
        alt={n.text || n.label}
        style={{ height: n.height || 180, objectFit: n.fit || "contain" }}
      />
    ) : (
      <div className="ad-empty">
        <span>▧</span>Choose an image in the Inspector
      </div>
    );
  if (n.type === "viewport")
    return (
      <div
        className="ad-viewport"
        style={{ height: Math.max(n.height || 440, 180) }}
      >
        <Viewport objects={objects} />
      </div>
    );
  if (n.type === "button")
    return (
      <div className="ad-control">
        <button
          className="ad-run"
          disabled={!preview || !canRun || !!busy}
          onClick={onRun}
        >
          {busy || n.label}
          <span>↗</span>
        </button>
        <p className="ad-help">One update · one geometry run</p>
      </div>
    );
  if (n.type === "value")
    return (
      <div className="ad-readout">
        <span className="ad-control-label">{n.label}</span>
        <pre>
          {source?.items?.length
            ? source.items.map((x) => (x === null ? "—" : String(x))).join("\n")
            : n.source
              ? "No values yet"
              : "Connect a data source"}
        </pre>
        <small>
          {source?.live
            ? "CURRENT INPUT"
            : source
              ? "LAST SOLVE"
              : "WAITING FOR DATA"}
          {source?.truncated ? " · TRUNCATED" : ""}
        </small>
      </div>
    );
  if (n.type === "chart") {
    const plot = source ? plotSeries(source.items) : null;
    return (
      <div className="ad-chart">
        <span className="ad-control-label">{n.label}</span>
        {plot ? (
          <>
            <svg
              viewBox="0 0 300 155"
              role="img"
              aria-label={`${n.label}: ${plot.count} numeric values, minimum ${plot.min}, maximum ${plot.max}`}
            >
              <path d="M20,20V130H280" className="ad-chart-axis" />
              <path d={plot.path} className="ad-chart-line" />
              {plot.points.filter(Boolean).map((p, i) => (
                <circle key={i} cx={p[0]} cy={p[1]} r="2.5" />
              ))}
            </svg>
            <div className="ad-chart-caption">
              <span>MIN {plot.min}</span>
              <span>MAX {plot.max}</span>
            </div>
            <small>
              LAST SOLVE · {plot.count} VALUES
              {source.truncated ? " · TRUNCATED" : ""}
            </small>
          </>
        ) : (
          <div className="ad-empty">
            {n.source
              ? "Run a definition with numeric output to see its graph."
              : "Connect a numeric output in the Inspector."}
          </div>
        )}
      </div>
    );
  }
  if (!control)
    return (
      <div className="ad-control ad-unbound">
        <span className="ad-control-label">{n.label}</span>
        <div className="ad-placeholder-track" />
        <small>
          {!definition
            ? "Open the matching Grasshopper file to activate"
            : n.binding
              ? "Input unavailable — reconnect in the layout editor"
              : "Choose a Grasshopper input in the layout editor"}
        </small>
      </div>
    );
  const disabled = !preview || !!busy,
    value = values[control.name] ?? control.value;
  const set = (v) => onValueChange(control.name, v);
  if (n.type === "slider" || n.type === "ruler")
    return (
      <NumberControl
        node={n}
        control={control}
        value={value}
        disabled={disabled}
        onChange={set}
      />
    );
  if (n.type === "toggle")
    return (
      <label className="ad-toggle ad-control">
        <span>{n.label}</span>
        <input
          type="checkbox"
          checked={!!value}
          disabled={disabled}
          onChange={(e) => set(e.target.checked)}
        />
        <span className="ad-switch" />
      </label>
    );
  if (n.type === "file")
    return (
      <div className="ad-control">
        <label className="ad-control-label">
          {n.label}
          <input
            type="file"
            disabled={disabled}
            accept="text/plain,text/csv,application/json,.txt,.csv,.json"
            onChange={async (e) => {
              const file = e.target.files[0];
              e.target.setCustomValidity("");
              if (file && file.size <= 10000) {
                const contents = await file.text();
                set(contents.slice(0, 10000));
              } else if (file)
                e.target.setCustomValidity("Choose a text file below 10 KB.");
              e.target.reportValidity();
              e.target.value = "";
            }}
          />
        </label>
        <small>Text content · max 10 KB · no server file path</small>
      </div>
    );
  return (
    <label className="ad-control ad-text-input">
      <span className="ad-control-label">{n.label}</span>
      <textarea
        aria-label={n.label}
        disabled={disabled}
        maxLength={10000}
        value={value}
        onChange={(e) => set(e.target.value)}
      />
    </label>
  );
}
function NumberControl({ node, control: c, value, disabled, onChange }) {
  const drag = useRef(null);
  const clamp = (v) => {
    let n = Math.max(c.min, Math.min(c.max, v));
    const step = c.step || 1;
    const base = c.interval === 3 ? 1 : c.interval >= 2 ? 0 : c.min;
    n = base + Math.round((n - base) / step) * step;
    return Math.max(c.min, Math.min(c.max, Number(n.toFixed(10))));
  };
  return (
    <div className="ad-control ad-number">
      <div className="ad-number-heading">
        <span className="ad-control-label">{node.label}</span>
        <div>
          <input
            aria-label={node.label + " value"}
            type="number"
            min={c.min}
            max={c.max}
            step={c.step}
            value={value}
            disabled={disabled}
            onChange={(e) => {
              if (Number.isFinite(e.target.valueAsNumber))
                onChange(clamp(e.target.valueAsNumber));
            }}
          />
          <small>{node.unit}</small>
        </div>
      </div>
      {node.type === "ruler" ? (
        <div
          className={"ad-ruler " + (disabled ? "ad-disabled" : "")}
          role="slider"
          tabIndex={disabled ? -1 : 0}
          aria-label={node.label}
          aria-disabled={disabled}
          aria-valuemin={c.min}
          aria-valuemax={c.max}
          aria-valuenow={value}
          onKeyDown={(e) => {
            if (!disabled && ["ArrowLeft", "ArrowRight"].includes(e.key)) {
              e.preventDefault();
              onChange(
                clamp(value + (e.key === "ArrowRight" ? 1 : -1) * c.step),
              );
            }
          }}
          onPointerDown={(e) => {
            if (disabled) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            drag.current = { x: e.clientX, value };
          }}
          onPointerMove={(e) => {
            if (drag.current)
              onChange(
                clamp(
                  drag.current.value +
                    (((e.clientX - drag.current.x) * (c.max - c.min)) / 240) *
                      (e.shiftKey ? 0.1 : 1),
                ),
              );
          }}
          onPointerUp={() => {
            drag.current = null;
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
          onLostPointerCapture={() => {
            drag.current = null;
          }}
        >
          <i />
          <span>{value}</span>
        </div>
      ) : (
        <input
          type="range"
          aria-label={node.label + " slider"}
          min={c.min}
          max={c.max}
          step={c.step}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(clamp(+e.target.value))}
        />
      )}
      <div className="ad-range-ends">
        <span>{c.min}</span>
        <span>{node.type === "ruler" ? "DRAG · SHIFT FOR FINE" : ""}</span>
        <span>{c.max}</span>
      </div>
    </div>
  );
}
