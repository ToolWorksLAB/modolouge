"use client";
import { useEffect, useState, useRef } from "react";
import AIAppRunner from "./AIAppRunner.jsx";
import AuthJourney from "./AuthJourney.jsx";
import { api } from "../lib/client-api.js";
export default function PublishedApp({ app }) {
  const [values, setValues] = useState(() =>
      Object.fromEntries(app.definition.controls.map((c) => [c.name, c.value])),
    ),
    [objects, setObjects] = useState([]),
    [dataOutputs, setDataOutputs] = useState([]),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [warnings, setWarnings] = useState([]),
    [usage, setUsage] = useState(null),
    [auth, setAuth] = useState(false),
    [online, setOnline] = useState(false),
    [solved, setSolved] = useState(null);
  const alive = useRef(true),
    lock = useRef(false),
    init = useRef(null);
  useEffect(() => {
    alive.current = true;
    init.current ||= api("trial/start", {});
    init.current
      .then(() => api("me"))
      .then(setUsage)
      .catch((e) => setError(e.message));
    const refresh = () =>
      api("status")
        .then((s) => setOnline(s.online))
        .catch(() => setOnline(false));
    refresh();
    const timer = setInterval(refresh, 20000);
    return () => {
      alive.current = false;
      clearInterval(timer);
    };
  }, []);
  const dirty = JSON.stringify(values) !== JSON.stringify(solved);
  async function run() {
    if (lock.current) return;
    if (usage?.kind === "guest" && usage.remaining <= 0) {
      setAuth(true);
      return;
    }
    lock.current = true;
    setBusy("Generating geometry…");
    setError("");
    try {
      const { id } = await api("jobs", {
        type: "solve",
        publishedSlug: app.slug,
        values,
      });
      for (let i = 0; i < 150; i++) {
        await new Promise((r) => setTimeout(r, 1600));
        if (!alive.current) return;
        const job = await api("jobs/" + id);
        if (job.status === "done") {
          const response = await fetch(job.resultUrl);
          if (!response.ok)
            throw new Error("The result expired. Please try again.");
          const result = await response.json();
          setObjects(result.objects || []);
          setDataOutputs(result.dataOutputs || []);
          setWarnings([...(result.errors || []), ...(result.warnings || [])]);
          setSolved({ ...values });
          return;
        }
        if (["failed", "expired"].includes(job.status))
          throw new Error(job.error || "This run could not be completed.");
      }
      throw new Error("This run timed out. Try again shortly.");
    } catch (e) {
      setError(e.message);
      if (e.code === "TRIAL_EXHAUSTED" || e.status === 401) setAuth(true);
    } finally {
      lock.current = false;
      if (alive.current) {
        setBusy("");
        api("me")
          .then(setUsage)
          .catch(() => {});
      }
    }
  }
  return (
    <main className="published-app">
      <div className="published-brand">
        <a href="/">
          modolouge<span className="pink"> / </span>by toolworkslab
        </a>
        <button className="quiet" onClick={() => setAuth(true)}>
          {usage?.kind === "member" ? usage.email : "Sign in"}
        </button>
      </div>
      {error && (
        <div className="notice error" role="alert">
          {error}
        </div>
      )}
      {!online && (
        <p className="notice">
          Geometry is currently unavailable. You can explore the app’s controls
          while the service is offline.
        </p>
      )}
      <AIAppRunner
        blueprint={app.blueprint}
        definition={app.definition}
        values={values}
        onChange={(name, value) => setValues((v) => ({ ...v, [name]: value }))}
        objects={objects}
        dataOutputs={dataOutputs}
        busy={busy}
        onRun={run}
        canRun={dirty && online && !!usage}
        runHint={dirty ? "Ready to apply your choices" : "Model is up to date"}
      />
      {warnings.map((w, i) => (
        <p key={i} className="notice">
          {w}
        </p>
      ))}
      <p className="fine">
        {usage
          ? `${usage.remaining} ${usage.kind === "guest" ? "free trial runs" : "jobs today"} remaining.`
          : "Checking your allowance…"}{" "}
        Your inputs stay in this session. <a href="/privacy">Privacy</a>
      </p>
      {auth && (
        <div
          className="auth-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Sign in to Modolouge"
        >
          <AuthJourney
            onClose={() => setAuth(false)}
            onComplete={async () => {
              setUsage(await api("me"));
              setAuth(false);
            }}
          />
        </div>
      )}
    </main>
  );
}
