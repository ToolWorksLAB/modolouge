"use client";
import { useEffect, useRef, useState, useId } from "react";
import { createLiveScheduler } from "../lib/live-compute.js";

export function useLiveCompute({ scope, values, dirty, busy, ready, onRun }) {
  const [choice, setChoice] = useState(null);
  const [paused, setPaused] = useState(false);
  const [interacting, setInteracting] = useState(false);
  const [visible, setVisible] = useState(true);
  const currentRun = useRef(onRun),
    scheduler = useRef(null);
  currentRun.current = onRun;
  const enabled = choice === scope && !!scope;
  const signature = JSON.stringify(values);
  useEffect(() => {
    setChoice(null);
    setPaused(false);
    const engine = createLiveScheduler({
      run: () => currentRun.current(),
      onFailure: () => {
        setChoice(null);
        setPaused(true);
      },
    });
    scheduler.current = engine;
    return () => {
      engine.dispose();
      scheduler.current = null;
    };
  }, [scope]);
  useEffect(() => {
    // Wait for slider/gumball release, even if the pointer pauses mid-drag.
    const down = () => setInteracting(true);
    const up = () => setInteracting(false);
    const visibility = () => {
      setVisible(!document.hidden);
      setInteracting(false);
    };
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("pointerup", up, true);
    document.addEventListener("pointercancel", up, true);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("blur", up);
    visibility();
    return () => {
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("pointerup", up, true);
      document.removeEventListener("pointercancel", up, true);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("blur", up);
    };
  }, []);
  useEffect(() => {
    scheduler.current?.update({
      enabled,
      signature,
      dirty,
      busy: !!busy,
      ready,
      interacting,
      visible,
    });
  }, [scope, enabled, signature, dirty, busy, ready, interacting, visible]);
  return {
    enabled,
    onChange: (checked) => {
      setPaused(false);
      setChoice(checked ? scope : null);
    },
    message: paused
      ? "Live compute paused after a failed run. Check the error, then enable it to retry."
      : enabled && !ready
        ? "Paused until compute and your run allowance are available."
        : enabled && busy
          ? "Computing your latest changes…"
          : enabled
            ? "Updates after you finish a change. Each update uses one geometry run."
            : "Update manually, or switch on automatic geometry updates.",
  };
}

export default function LiveCompute({ live }) {
  const id = useId();
  if (!live) return null;
  return (
    <div className={"live-compute " + (live.enabled ? "is-live" : "")}>
      <label className="live-compute-switch">
        <input
          type="checkbox"
          role="switch"
          aria-label="Live compute"
          checked={live.enabled}
          onChange={(e) => live.onChange(e.target.checked)}
          aria-describedby={id}
        />
        <span className="live-compute-track" aria-hidden="true" />
        <span>Live compute</span>
        <small>{live.enabled ? "On" : "Off"}</small>
      </label>
      <p id={id} role="status">
        {live.message}
      </p>
    </div>
  );
}
