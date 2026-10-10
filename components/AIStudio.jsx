"use client";
import { useState, useEffect } from "react";
import AIAppRunner from "./AIAppRunner.jsx";
import { api } from "../lib/client-api.js";

export default function AIStudio({
  definition,
  initialApp,
  brief = "",
  onBrief,
  onOpen,
  librarySignal,
  member,
  onSignIn,
  onManual,
  request = api,
  ...runner
}) {
  const [app, setApp] = useState(initialApp || null),
    [plan, setPlan] = useState(initialApp?.blueprint || null),
    [prompt, setPrompt] = useState(brief),
    [pending, setPending] = useState(""),
    [error, setError] = useState(""),
    [consent, setConsent] = useState(false),
    [review, setReview] = useState(false),
    [publishConfirm, setPublishConfirm] = useState(false),
    [library, setLibrary] = useState(null),
    [copied, setCopied] = useState(false);
  const dirty =
    !!plan && JSON.stringify(plan) !== JSON.stringify(app?.blueprint);
  const locked = !!pending || !!runner.busy;
  async function action(label, fn) {
    if (locked) return;
    setPending(label);
    setError("");
    try {
      return await fn();
    } catch (e) {
      setError(e.message);
      if (e.status === 401 || e.code === "TRIAL_EXHAUSTED") onSignIn();
    } finally {
      setPending("");
    }
  }
  async function showLibrary() {
    await action("Opening your apps…", async () =>
      setLibrary(await request("apps")),
    );
  }
  useEffect(() => {
    if (librarySignal) showLibrary();
  }, [librarySignal]);
  async function generate() {
    await action("Reading the graph and shaping your app…", async () => {
      const result = await request("apps/generate", {
        definitionId: definition.id,
        appId: app?.id,
        revision: app?.revision || 0,
        prompt,
        consent,
      });
      setApp(result);
      setPlan(result.blueprint);
      setReview(false);
      setPrompt("");
    });
  }
  async function save() {
    const result = await request("apps/save", {
      id: app.id,
      revision: app.revision,
      blueprint: plan,
    });
    setApp(result);
    setPlan(result.blueprint);
    return result;
  }
  async function publish() {
    await action("Publishing your app…", async () => {
      const saved = dirty ? await save() : app;
      const publication = await request("apps/publish", {
        id: saved.id,
        revision: saved.revision,
        confirmPublic: publishConfirm,
      });
      setApp({ ...saved, publication });
      setPublishConfirm(false);
    });
  }
  const change = (key, value) => setPlan((p) => ({ ...p, [key]: value }));
  const changeStep = (index, key, value) =>
    setPlan((p) => ({
      ...p,
      steps: p.steps.map((s, i) => (i === index ? { ...s, [key]: value } : s)),
    }));
  function moveInput(from, control, to) {
    setPlan((p) => ({
      ...p,
      steps: p.steps.map((s, i) => ({
        ...s,
        controls:
          i === from
            ? s.controls.filter((c) => c.binding !== control.binding)
            : i === to
              ? [...s.controls, control]
              : s.controls,
      })),
    }));
  }
  return (
    <div className="ai-studio">
      <div className="ai-builder-bar">
        <div className="ai-journey">
          <span className={!plan ? "current" : "done"}>01 / Describe</span>
          <i />
          <span className={plan ? "current" : ""}>02 / Make it yours</span>
          <i />
          <span className={app?.publication?.active ? "current" : ""}>
            03 / Publish
          </span>
        </div>
        <button className="quiet" disabled={locked} onClick={showLibrary}>
          My apps
        </button>
      </div>
      {error && (
        <div className="notice error" role="alert">
          {error}
        </div>
      )}
      {pending && (
        <div className="ai-pending" role="status">
          <span className="spinner" />
          <div>
            <strong>{pending}</strong>
            <small>
              Your current draft stays intact until the new one is ready.
            </small>
          </div>
        </div>
      )}
      {library !== null && (
        <section className="ai-library">
          <div className="panel-heading">
            <h2>Pick up where you left off.</h2>
            <button className="quiet" onClick={() => setLibrary(null)}>
              Close
            </button>
          </div>
          <p>
            Saved definitions and drafts. Reopen without uploading the file
            again.
          </p>
          <div className="ai-library-grid">
            {library.map((a) => (
              <button
                className="ai-library-card"
                key={a.id}
                disabled={locked}
                onClick={() =>
                  action("Opening app…", async () => {
                    const result = await request("apps/open", { id: a.id });
                    setLibrary(null);
                    onOpen(result);
                  })
                }
              >
                <span className="eyebrow">
                  {a.blueprint
                    ? `${a.blueprint.steps.length} STEPS`
                    : "READY TO DRAFT"}
                </span>
                <strong>{a.blueprint?.title || a.filename}</strong>
                <small>{a.filename}</small>
                <span>Open app ↗</span>
              </button>
            ))}
          </div>
          {!library.length && (
            <p>No saved apps yet. Open a file and create your first draft.</p>
          )}
        </section>
      )}
      {!plan ? (
        <section className="ai-brief">
          <div>
            <span className="eyebrow">FROM DEFINITION TO EXPERIENCE</span>
            <h2>
              What should your
              <br />
              app help people do<span className="pink">?</span>
            </h2>
            <p>
              Tell us who it’s for and what they’re trying to make. We’ll use
              your Grasshopper graph to suggest the controls, language and
              steps.
            </p>
            {definition && (
              <div className="ai-file-facts">
                <span>{definition.controls.length} editable inputs</span>
                <span>{definition.graph?.nodes?.length || 0} components</span>
                <span>{definition.graph?.groups?.length || 0} groups</span>
              </div>
            )}
          </div>
          <div className="ai-brief-form">
            <label htmlFor="app-brief">
              The idea <span>optional</span>
            </label>
            <textarea
              id="app-brief"
              maxLength={4000}
              value={prompt}
              disabled={locked}
              onChange={(e) => {
                setPrompt(e.target.value);
                onBrief?.(e.target.value);
              }}
              placeholder="For example: help an architect explore a facade. Start with the overall dimensions, then tune the pattern. Keep technical options out of the first step."
              rows={6}
            />
            <div className="ai-suggestions">
              {[
                "Make it simple for a first-time user.",
                "Guide an architect through the design decisions.",
                "Let a client compare design options.",
              ].map((s) => (
                <button
                  key={s}
                  className="quiet"
                  disabled={locked}
                  onClick={() => setPrompt(s)}
                >
                  {s}
                </button>
              ))}
            </div>
            <label className="ai-consent">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              Send the saved node labels, groups, connections, panel text and
              this brief to our AI provider.
            </label>
            <button
              className="button primary"
              disabled={locked || !consent || !definition}
              onClick={generate}
            >
              Create my app <span>↗</span>
            </button>
            <small>
              One free AI draft. Sign in for refinements and publishing. AI
              suggestions need your review.
            </small>
            <button className="text-link" onClick={onManual}>
              Open manual tools instead →
            </button>
          </div>
        </section>
      ) : (
        <>
          <div className="ai-draft-actions">
            <div>
              <span className="eyebrow">YOUR APP / DRAFT {app?.revision}</span>
              <strong>
                {dirty ? "You have unsaved edits" : "Draft saved"}
              </strong>
            </div>
            <div>
              <button className="quiet" onClick={() => setReview(!review)}>
                {review ? "Hide editor" : "Edit steps & style"}
              </button>
              <button
                className="button quiet"
                disabled={!dirty || locked}
                onClick={() => action("Saving…", save)}
              >
                Save changes
              </button>
              <button
                className="button primary"
                disabled={locked}
                onClick={() =>
                  member ? setPublishConfirm(!publishConfirm) : onSignIn()
                }
              >
                {app?.publication?.active ? "Republish" : "Publish app"} ↗
              </button>
            </div>
          </div>
          {publishConfirm && (
            <section className="ai-publish">
              <div>
                <h3>Give your app a place on the web.</h3>
                <p>
                  Anyone with the link can see this interface, its default
                  values and generated results. The Grasshopper archive stays
                  private. Visitors get five trial runs, then need a verified
                  account. Runs use your company’s compute service.
                </p>
                <p>
                  By clicking Publish, you confirm you have the right to share
                  this app and its outputs.
                </p>
              </div>
              <button
                className="button primary"
                disabled={locked}
                onClick={publish}
              >
                Publish this version ↗
              </button>
              <button
                className="quiet"
                onClick={() => setPublishConfirm(false)}
              >
                Cancel
              </button>
            </section>
          )}
          {app?.publication?.active && (
            <div className="ai-live-link">
              <span>Published version {app.publication.revision}</span>
              <a
                href={`/a/${app.publication.slug}`}
                target="_blank"
                rel="noreferrer"
              >
                Open published app ↗
              </a>
              <button
                className="quiet"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(
                      `${location.origin}/a/${app.publication.slug}`,
                    );
                    setCopied(true);
                  } catch {
                    setError(
                      "Copy the link from the published app’s address bar.",
                    );
                  }
                }}
              >
                {copied ? "Copied" : "Copy link"}
              </button>
              <button
                className="quiet"
                disabled={locked}
                onClick={() =>
                  action("Taking the app offline…", async () => {
                    await request("apps/unpublish", { id: app.id });
                    setApp({
                      ...app,
                      publication: { ...app.publication, active: false },
                    });
                  })
                }
              >
                Unpublish
              </button>
            </div>
          )}
          {review && (
            <section className="ai-review">
              <div className="ai-review-summary">
                <span className="eyebrow">
                  THE THINKING / {plan.confidence} CONFIDENCE
                </span>
                <p>{plan.reasoning}</p>
                {plan.questions.length > 0 && (
                  <div>
                    <strong>Worth clarifying</strong>
                    <ul>
                      {plan.questions.map((q, i) => (
                        <li key={i}>{q}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {plan.warnings.length > 0 && (
                  <ul className="ai-warnings">
                    {plan.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                )}
                <p className="fine">
                  These steps organize the interface. All steps still run as one
                  Grasshopper definition.
                </p>
              </div>
              <div className="ai-review-fields">
                <label>
                  App title
                  <input
                    maxLength={100}
                    value={plan.title}
                    onChange={(e) => change("title", e.target.value)}
                  />
                </label>
                <label>
                  Introduction
                  <textarea
                    maxLength={500}
                    value={plan.description}
                    onChange={(e) => change("description", e.target.value)}
                  />
                </label>
                <div className="ai-style-fields">
                  <label>
                    Surface
                    <select
                      value={plan.theme}
                      onChange={(e) => change("theme", e.target.value)}
                    >
                      <option value="paper">Warm paper</option>
                      <option value="graphite">Graphite</option>
                    </select>
                  </label>
                  <label>
                    Accent
                    <select
                      value={plan.accent}
                      onChange={(e) => change("accent", e.target.value)}
                    >
                      <option value="pink">Studio pink</option>
                      <option value="green">Grasshopper green</option>
                      <option value="blue">Blueprint blue</option>
                    </select>
                  </label>
                  <label>
                    Layout
                    <select
                      value={plan.arrangement}
                      onChange={(e) => change("arrangement", e.target.value)}
                    >
                      <option value="model">Model first</option>
                      <option value="balanced">Balanced</option>
                    </select>
                  </label>
                </div>
              </div>
              <div className="ai-step-editor">
                {plan.steps.map((s, index) => (
                  <details key={s.id}>
                    <summary>
                      {String(index + 1).padStart(2, "0")} / {s.title}{" "}
                      <span>{s.controls.length} inputs</span>
                    </summary>
                    <label>
                      Step name
                      <input
                        maxLength={80}
                        value={s.title}
                        onChange={(e) =>
                          changeStep(index, "title", e.target.value)
                        }
                      />
                    </label>
                    <label>
                      Guidance
                      <textarea
                        maxLength={400}
                        value={s.description}
                        onChange={(e) =>
                          changeStep(index, "description", e.target.value)
                        }
                      />
                    </label>
                    {s.controls.map((c, ci) => (
                      <div className="ai-binding-editor" key={c.binding}>
                        <input
                          aria-label={`Label for ${c.label}`}
                          maxLength={100}
                          value={c.label}
                          onChange={(e) =>
                            changeStep(
                              index,
                              "controls",
                              s.controls.map((v, i) =>
                                i === ci ? { ...v, label: e.target.value } : v,
                              ),
                            )
                          }
                        />
                        <select
                          aria-label={`Move ${c.label} to step`}
                          value={index}
                          onChange={(e) => moveInput(index, c, +e.target.value)}
                        >
                          {plan.steps.map((t, i) => (
                            <option value={i} key={t.id}>
                              {i + 1}. {t.title}
                            </option>
                          ))}
                        </select>
                        <input
                          aria-label={`Help for ${c.label}`}
                          maxLength={300}
                          value={c.help}
                          onChange={(e) =>
                            changeStep(
                              index,
                              "controls",
                              s.controls.map((v, i) =>
                                i === ci ? { ...v, help: e.target.value } : v,
                              ),
                            )
                          }
                        />
                      </div>
                    ))}
                    {plan.steps.length > 1 && (
                      <button
                        className="quiet"
                        onClick={() =>
                          setPlan((p) => ({
                            ...p,
                            steps: p.steps
                              .filter((_, i) => i !== index)
                              .map((t, i) =>
                                i === 0
                                  ? {
                                      ...t,
                                      controls: [...t.controls, ...s.controls],
                                    }
                                  : t,
                              ),
                          }))
                        }
                      >
                        Remove step and keep its inputs in step 1
                      </button>
                    )}
                  </details>
                ))}
                {plan.steps.length < 6 && (
                  <button
                    className="quiet"
                    onClick={() =>
                      setPlan((p) => ({
                        ...p,
                        steps: [
                          ...p.steps,
                          {
                            id: "step-" + Date.now(),
                            title: "New step",
                            description: "",
                            evidence: [],
                            controls: [],
                          },
                        ],
                      }))
                    }
                  >
                    + Add a step
                  </button>
                )}
              </div>
            </section>
          )}
          <AIAppRunner
            key={app.id}
            blueprint={plan}
            definition={definition}
            {...runner}
          />
          <section className="ai-refine">
            <div>
              <span className="eyebrow">KEEP THE CONVERSATION GOING</span>
              <h3>What would make this better?</h3>
              <p>
                Ask for clearer language, a different order or fewer steps. Your
                published version stays unchanged.
              </p>
            </div>
            <div>
              <textarea
                aria-label="Refine your app"
                rows={3}
                maxLength={4000}
                value={prompt}
                disabled={locked}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Make the first step simpler. Put the detailed pattern controls together."
              />
              <label className="ai-consent">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                Send this brief and the saved graph metadata to AI.
              </label>
              <button
                className="button quiet"
                disabled={locked || !prompt.trim() || !consent || dirty}
                onClick={generate}
              >
                Refine the draft ↗
              </button>
              {dirty && (
                <small>Save your edits before asking AI to refine them.</small>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
