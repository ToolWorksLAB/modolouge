"use client";
import { useState, useRef, useEffect } from "react";
import dynamic from "next/dynamic";
import AuthJourney from "./AuthJourney.jsx";
import DefinitionView from "./DefinitionView.jsx";
import WorkspaceStart from "./WorkspaceStart.jsx";
import ModelControls from "./ModelControls.jsx";
import {
  changedControls,
  serviceLabel,
  runLabel,
} from "../lib/workspace-flow.js";
import { api } from "../lib/client-api.js";
export { api } from "../lib/client-api.js";
const AppDesigner = dynamic(() => import("./AppDesigner.jsx"), {
  loading: () => <div className="notice">Opening your app…</div>,
});
const AIStudio = dynamic(() => import("./AIStudio.jsx"));
export default function Workspace({ previewFixture, previewDesignRequest }) {
  const demo = process.env.NODE_ENV === "development" && !!previewFixture;
  const [status, setStatus] = useState(null),
    [definition, setDefinition] = useState(null),
    [values, setValues] = useState({}),
    [objects, setObjects] = useState([]),
    [dataOutputs, setDataOutputs] = useState([]),
    [mode, setMode] = useState("explore"),
    [designerOpened, setDesignerOpened] = useState(false),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [warnings, setWarnings] = useState([]),
    [duration, setDuration] = useState(null),
    [usage, setUsage] = useState(null),
    [drag, setDrag] = useState(false),
    [showAuth, setShowAuth] = useState(false),
    [solvedValues, setSolvedValues] = useState(null),
    [controlQuery, setControlQuery] = useState(""),
    [libraryRequest, setLibraryRequest] = useState(0),
    [designerSeed, setDesignerSeed] = useState(null),
    [authPurpose, setAuthPurpose] = useState(""),
    [authDismissed, setAuthDismissed] = useState(0);
  const [appBrief, setAppBrief] = useState(""),
    [appSeed, setAppSeed] = useState(null),
    [appLibrary, setAppLibrary] = useState(0);
  const input = useRef(),
    trialInit = useRef(null),
    lock = useRef(false),
    alive = useRef(true),
    reconnect = useRef(false),
    pendingWorkspaceAction = useRef(null),
    errorRef = useRef(null);
  useEffect(() => {
    alive.current = true;
    const openSignIn = () => {
      setAuthPurpose("");
      setShowAuth(true);
    };
    window.addEventListener("modolouge-signin", openSignIn);
    if (demo) {
      setStatus({ online: true });
      setUsage({ kind: "guest", remaining: 5 });
      return () => {
        alive.current = false;
        window.removeEventListener("modolouge-signin", openSignIn);
      };
    }
    const refresh = () => {
      api("status")
        .then(setStatus)
        .catch(() => setStatus({ online: false }));
      api("me")
        .then(setUsage)
        .catch(() => {});
    };
    trialInit.current ||= api("trial/start", {});
    trialInit.current
      .then(() => api("me"))
      .then(setUsage)
      .catch((e) => setError(e.message));
    api("status")
      .then(setStatus)
      .catch(() => setStatus({ online: false }));
    const interval = setInterval(refresh, 20000);
    return () => {
      alive.current = false;
      clearInterval(interval);
      window.removeEventListener("modolouge-signin", openSignIn);
    };
  }, []);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  const changes = changedControls(definition?.controls, values, solvedValues);
  const exhausted = usage?.kind === "guest" && usage.remaining <= 0;
  const needsRun = !!definition && (!solvedValues || changes > 0);
  const changeValue = (name, value) =>
    setValues((previous) => ({ ...previous, [name]: value }));
  const openDesigner = () => {
    setDesignerOpened(true);
    setMode("design");
  };
  const openLibrary = () => {
    if (usage?.kind !== "member") {
      pendingWorkspaceAction.current = "library";
      setAuthPurpose("library");
      setShowAuth(true);
      return;
    }
    openDesigner();
    setLibraryRequest((n) => n + 1);
  };
  function chooseFile(seed = null) {
    setLibraryRequest(0);
    reconnect.current = !!seed;
    setDesignerSeed(seed);
    input.current.click();
  }
  async function openAIApp(result) {
    if (result.geometryUnchanged && result.id === appSeed?.id && definition) {
      setAppSeed({ ...result, definition });
      setMode("ai");
      return;
    }
    let preview = null;
    if (result.resultUrl) {
      try {
        const response = await fetch(result.resultUrl);
        if (response.ok) {
          const data = await response.json();
          preview = data.geometry || data;
        }
      } catch {
        /* The saved app can still be opened and run again. */
      }
    }
    setDefinition(result.definition);
    setValues(
      Object.fromEntries(
        result.definition.controls.map((c) => [c.name, c.value]),
      ),
    );
    setObjects(preview?.objects || []);
    setDataOutputs(preview?.dataOutputs || []);
    setDuration(preview?.duration ?? null);
    setWarnings([
      ...(result.definition.warnings || []),
      ...(preview?.warnings || []),
    ]);
    setSolvedValues(
      preview
        ? Object.fromEntries(
            result.definition.controls.map((c) => [c.name, c.value]),
          )
        : null,
    );
    setAppSeed(result);
    setMode("ai");
    setAppLibrary(0);
  }
  function openApps() {
    setMode("ai");
    setAppLibrary((n) => n + 1);
  }
  async function job(body) {
    const { id } = await api("jobs", body);
    for (let n = 0; n < 150; n++) {
      await new Promise((r) => setTimeout(r, 1600));
      if (!alive.current) throw new Error("Workspace closed.");
      const j = await api("jobs/" + id);
      if (j.status === "done") {
        const r = await fetch(j.resultUrl);
        if (!r.ok) throw new Error("Result expired. Run the definition again.");
        return r.json();
      }
      if (["failed", "expired"].includes(j.status))
        throw new Error(
          j.error ||
            "The request expired. Try again when compute is available.",
        );
      setBusy(
        j.status === "running"
          ? "Generating the model…"
          : "Waiting for compute…",
      );
    }
    throw new Error("The request took too long. Please retry.");
  }
  async function solve(def = definition, v = values) {
    const result = demo
      ? previewFixture
      : await job({ type: "solve", definitionId: def.id, values: v });
    setObjects(result.objects || []);
    setDataOutputs(result.dataOutputs || []);
    setDuration(result.duration);
    setSolvedValues(result.errors?.length ? null : { ...v });
    setWarnings([
      ...(def.warnings || []),
      ...(result.errors || []),
      ...(result.warnings || []),
    ]);
  }
  async function run() {
    if (lock.current || !definition || !needsRun) return;
    if (exhausted) {
      setAuthPurpose("");
      setShowAuth(true);
      return;
    }
    lock.current = true;
    setBusy("Updating the model…");
    setError("");
    try {
      await solve();
    } catch (e) {
      setError(e.message);
      if (e.code === "TRIAL_EXHAUSTED") setShowAuth(true);
    } finally {
      lock.current = false;
      setBusy("");
      if (!demo)
        api("me")
          .then(setUsage)
          .catch(() => {});
    }
  }
  async function load(file, example = false) {
    if (lock.current) return;
    if (exhausted) {
      setAuthPurpose("");
      setShowAuth(true);
      return;
    }
    if (
      !example &&
      (!/\.(gh|ghx)$/i.test(file?.name) || file.size > 20 * 1024 * 1024)
    ) {
      setError("Choose a .gh or .ghx file up to 20 MB.");
      return;
    }
    lock.current = true;
    setBusy(
      example ? "Opening the example…" : "Uploading your Grasshopper file…",
    );
    setError("");
    try {
      let d;
      if (demo) d = previewFixture;
      else if (example) d = await job({ type: "example" });
      else {
        const init = await api("uploads", {
          filename: file.name,
          size: file.size,
        });
        const form = new FormData();
        Object.entries(init.upload.fields).forEach(([k, v]) =>
          form.append(k, v),
        );
        form.append("file", file);
        const up = await fetch(init.upload.url, { method: "POST", body: form });
        if (!up.ok)
          throw new Error(
            "The upload didn’t complete. Choose the file again to retry.",
          );
        setBusy("Reading the file’s controls…");
        d = await job({ type: "prepare", definitionId: init.id });
      }
      const v = Object.fromEntries(d.controls.map((c) => [c.name, c.value]));
      if (reconnect.current) await solve(d, v);
      else {
        setObjects([]);
        setDataOutputs([]);
        setSolvedValues(null);
      }
      setDefinition(d);
      setValues(v);
      setAppSeed(null);
      setAppLibrary(0);
      setControlQuery("");
      setMode(reconnect.current ? "design" : "ai");
    } catch (e) {
      setError(e.message);
      if (e.code === "TRIAL_EXHAUSTED") setShowAuth(true);
    } finally {
      lock.current = false;
      setBusy("");
      if (!demo)
        api("me")
          .then(setUsage)
          .catch(() => {});
    }
  }

  return (
    <main
      className={
        "workspace flow-workspace " +
        (definition || mode === "design" ? "flow-active" : "")
      }
    >
      {demo && (
        <div className="notice">
          Workflow preview · saved test geometry · no cloud requests or emails.
        </div>
      )}
      <input
        ref={input}
        type="file"
        accept=".gh,.ghx"
        hidden
        onChange={(e) => {
          if (e.target.files[0]) load(e.target.files[0]);
          e.target.value = "";
        }}
      />
      {(definition || mode === "design") && (
        <div className="flow-topline">
          <div className="flow-file">
            <span className="eyebrow">MODOLOUGE</span>
            <h1>{definition?.filename || "Your app layout"}</h1>
          </div>
          <div className="flow-top-actions">
            <button
              className="quiet"
              disabled={!!busy}
              onClick={() => chooseFile()}
            >
              {" "}
              {definition ? "Replace file" : "Open Grasshopper file"} ↥
            </button>
            <button className="quiet" disabled={!!busy} onClick={openLibrary}>
              Saved layouts
            </button>
            <span className={"status " + (status?.online ? "online" : "")}>
              <i />
              {serviceLabel(status)}
            </span>
          </div>
        </div>
      )}
      {error && (
        <div
          role="alert"
          tabIndex={-1}
          ref={errorRef}
          className="notice error flow-error"
        >
          <span>{error}</span>
          <button className="quiet" onClick={() => setError("")}>
            Dismiss
          </button>
        </div>
      )}
      {busy && (
        <div className="flow-progress" role="status">
          <span className="spinner" />
          <div>
            <strong>{busy}</strong>
            <span>
              {definition
                ? "Your current result stays here until the new one is ready."
                : "Reading the graph and its editable inputs. This can take a moment."}
            </span>
          </div>
        </div>
      )}
      {!definition && mode === "explore" ? (
        <WorkspaceStart
          status={status}
          usage={usage}
          busy={busy}
          drag={drag}
          onChoose={() => chooseFile()}
          onExample={() => {
            reconnect.current = false;
            setDesignerSeed(null);
            load(null, true);
          }}
          onLibrary={openLibrary}
          onApps={openApps}
          onSignIn={() => setShowAuth(true)}
          onDrag={setDrag}
          onDrop={(file) => {
            reconnect.current = false;
            setDesignerSeed(null);
            load(file);
          }}
        />
      ) : (
        <>
          <div className="flow-navigation">
            <div className="workspace-modes" aria-label="Workspace mode">
              <button
                aria-pressed={mode === "ai"}
                onClick={() => setMode("ai")}
              >
                Create an app
              </button>
              <button
                aria-pressed={mode === "explore"}
                onClick={() => setMode("explore")}
              >
                Model
              </button>
              <button aria-pressed={mode === "design"} onClick={openDesigner}>
                Advanced layout
              </button>
            </div>
            <span className="flow-allowance">
              {usage
                ? usage.kind === "guest"
                  ? `${usage.remaining} free runs left`
                  : `${usage.remaining} jobs left today`
                : "Checking allowance…"}
            </span>
          </div>
          {definition && (
            <div hidden={mode !== "explore"}>
              <div className="studio flow-studio">
                <ModelControls
                  definition={definition}
                  values={values}
                  busy={busy}
                  onChange={changeValue}
                  query={controlQuery}
                  onQuery={setControlQuery}
                  onReset={() =>
                    setValues(
                      Object.fromEntries(
                        definition.controls.map((c) => [c.name, c.value]),
                      ),
                    )
                  }
                  runText={runLabel({
                    busy,
                    exhausted,
                    hasResult: !!solvedValues,
                    changes,
                  })}
                  canRun={!busy && status?.online && (needsRun || exhausted)}
                  onRun={() => (exhausted ? setShowAuth(true) : run())}
                  changes={changes}
                  hasResult={!!solvedValues}
                />
                <DefinitionView
                  definition={definition}
                  objects={objects}
                  values={values}
                  onValueChange={changeValue}
                  busy={busy}
                  duration={duration}
                  initialMode="geometry"
                  pendingChanges={changes}
                />
              </div>
              <div className="flow-next">
                <div>
                  <strong>Ready to make this your own?</strong>
                  <span>
                    Your controls are already connected. Choose the look and
                    what people can change.
                  </span>
                </div>
                <button className="text-link" onClick={openDesigner}>
                  Customize this app ↗
                </button>
              </div>
            </div>
          )}
        </>
      )}
      {(definition || mode === "ai") && (
        <div hidden={mode !== "ai"}>
          <AIStudio
            key={(definition?.id || "library") + ":" + (appSeed?.revision || 0)}
            definition={definition}
            initialApp={appSeed}
            brief={appBrief}
            onBrief={setAppBrief}
            onOpen={openAIApp}
            librarySignal={appLibrary}
            member={usage?.kind === "member"}
            onSignIn={() => setShowAuth(true)}
            onManual={openDesigner}
            values={values}
            onChange={changeValue}
            objects={objects}
            dataOutputs={dataOutputs}
            solvedValues={solvedValues}
            onRun={run}
            busy={busy}
            canRun={needsRun && !!status?.online}
            runHint={
              changes
                ? `${changes} changes ready to apply`
                : solvedValues
                  ? "Model is up to date"
                  : "Generate your first result"
            }
          />
        </div>
      )}
      {designerOpened && (
        <div hidden={mode !== "design"}>
          <AppDesigner
            key={definition?.id || "blank"}
            definition={definition}
            objects={objects}
            dataOutputs={dataOutputs}
            values={values}
            onValueChange={changeValue}
            onRun={run}
            busy={busy}
            canRun={needsRun && !!status?.online}
            runHint={
              changes
                ? `${changes} unapplied ${changes === 1 ? "change" : "changes"}`
                : solvedValues
                  ? "Model is up to date"
                  : "Generate your first model"
            }
            member={usage?.kind === "member"}
            accountKey={usage?.kind === "member" ? usage.email : ""}
            initialDocument={designerSeed?.document}
            initialCloud={designerSeed?.cloud}
            libraryRequest={libraryRequest}
            request={demo ? previewDesignRequest : undefined}
            authDismissed={authDismissed}
            onChooseDefinition={(document, cloud) =>
              chooseFile({ document, cloud })
            }
            onSignIn={(purpose) => {
              setAuthPurpose(purpose || "");
              setShowAuth(true);
            }}
          />
        </div>
      )}
      {warnings.length > 0 && (
        <details className="notice">
          <summary>File notes ({[...new Set(warnings)].length})</summary>
          {[...new Set(warnings)].map((w) => (
            <p key={w}>{w}</p>
          ))}
        </details>
      )}
      <div className="flow-service-note">
        <p>
          Uploads support reviewed Grasshopper components. Scripts and
          unreviewed plugins are unavailable. Files expire after 24 hours.
        </p>
        <p>
          Trial activity and IP addresses are recorded to prevent misuse; IP
          records are removed after 30 days.{" "}
          <a href="/privacy">Privacy & service details ↗</a>
        </p>
      </div>
      {showAuth && (
        <div
          className="auth-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Sign in to Modolouge"
        >
          <AuthJourney
            streamlined
            hasExploration={!!definition || designerOpened}
            purpose={authPurpose}
            demo={demo}
            onClose={() => {
              pendingWorkspaceAction.current = null;
              setShowAuth(false);
              setAuthPurpose("");
              setAuthDismissed((n) => n + 1);
            }}
            onComplete={async () => {
              const me = demo
                ? {
                    kind: "member",
                    email: "preview@example.invalid",
                    remaining: 60,
                  }
                : await api("me");
              setUsage(me);
              if (pendingWorkspaceAction.current === "library") {
                pendingWorkspaceAction.current = null;
                openDesigner();
                setLibraryRequest((n) => n + 1);
              }
              setShowAuth(false);
              setError("");
              window.dispatchEvent(
                new CustomEvent("modolouge-auth", {
                  detail: { email: me.email },
                }),
              );
            }}
          />
        </div>
      )}
    </main>
  );
}
