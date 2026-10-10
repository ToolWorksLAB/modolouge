"use client";
import { useEffect, useRef } from "react";

export default function AppConversation({
  conversation = [],
  prompt,
  onPrompt,
  onSend,
  pending,
  disabled,
  consent,
  onConsent,
  allowEdits,
  onAllowEdits,
  member,
  events = [],
  dirty,
}) {
  const transcript = useRef(null);
  useEffect(() => {
    if (transcript.current)
      transcript.current.scrollTop = transcript.current.scrollHeight;
  }, [conversation.length, pending, events.length]);
  return (
    <aside className="app-chat" aria-label="App design conversation">
      <header>
        <span className="eyebrow">YOUR BUILD PARTNER</span>
        <h3>Keep shaping it.</h3>
        <p>
          Ask for a change, answer a question, or tell us what should happen
          next.
        </p>
      </header>
      <div
        ref={transcript}
        className="app-chat-transcript"
        role="log"
        aria-label="Conversation history"
      >
        {conversation.length ? (
          conversation.map((message, i) => (
            <article key={i} className={message.role}>
              <span className="eyebrow">
                {message.role === "user" ? "You" : "Modolouge"}
              </span>
              <p>{message.text}</p>
              {!!message.events?.length && (
                <details>
                  <summary>What was checked</summary>
                  <ul>
                    {message.events
                      .filter((e) => e.status !== "running")
                      .map((e, j) => (
                        <li key={j}>{e.message}</li>
                      ))}
                  </ul>
                </details>
              )}
            </article>
          ))
        ) : (
          <p className="app-chat-empty">
            Your app is ready for its next idea. Every saved change becomes a
            revision you can restore.
          </p>
        )}
        {pending && (
          <>
            <article className="user">
              <span className="eyebrow">You</span>
              <p>{prompt}</p>
            </article>
            <article className="assistant" role="status">
              <span className="spinner" />
              <p>{events.at(-1)?.message || "Working on your request…"}</p>
            </article>
          </>
        )}
      </div>
      <form
        className="app-chat-composer"
        onSubmit={(e) => {
          e.preventDefault();
          if (!disabled && consent && prompt.trim()) onSend();
        }}
      >
        <label htmlFor="app-chat-prompt">Message Modolouge</label>
        <textarea
          id="app-chat-prompt"
          aria-label="Refine your app"
          value={prompt}
          rows={4}
          maxLength={4000}
          disabled={disabled}
          onChange={(e) => onPrompt(e.target.value)}
          placeholder="Add a review screen and PDF download. What else do you need from me?"
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
              e.preventDefault();
              if (!disabled && consent && prompt.trim()) onSend();
            }
          }}
        />
        <label className="ai-consent">
          <input
            type="checkbox"
            checked={allowEdits}
            disabled={disabled || !member}
            onChange={(e) => onAllowEdits(e.target.checked)}
          />
          Allow edits to a copy of the Grasshopper definition
        </label>
        <label className="ai-consent">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => onConsent(e.target.checked)}
          />
          Send my messages, saved answers and graph metadata to AI.
        </label>
        <button
          className="button primary"
          disabled={disabled || !consent || !prompt.trim()}
        >
          {" "}
          {pending ? "Working…" : "Send message ↗"}
        </button>
        <small>
          {dirty
            ? "Your settings and answers will be saved before this message."
            : "Appearance and workflow changes do not need a geometry run."}
        </small>
      </form>
    </aside>
  );
}
