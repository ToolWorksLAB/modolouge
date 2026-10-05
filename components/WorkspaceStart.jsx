"use client";
import ParametricStudy from "./ParametricStudy.jsx";
import { serviceLabel } from "../lib/workspace-flow.js";

export default function WorkspaceStart({
  status,
  usage,
  busy,
  drag,
  onChoose,
  onExample,
  onLibrary,
  onSignIn,
  onDrag,
  onDrop,
}) {
  const ready = !!status?.online && !!usage && !busy;
  const exhausted = usage?.kind === "guest" && usage.remaining <= 0;
  return (
    <section className="flow-start" aria-label="Start exploring">
      <div className="flow-start-copy">
        <span className="eyebrow">GRASSHOPPER → SOMETHING YOU CAN USE</span>
        <h1>
          Your file.
          <br />A working model<span className="pink">.</span>
        </h1>
        <p className="flow-lead">
          Open a Grasshopper file. Its controls and 3D model appear together.
          Make it an app when you’re ready.
        </p>
        <button
          className={"flow-drop " + (drag ? "dragging" : "")}
          disabled={!ready}
          onClick={exhausted ? onSignIn : onChoose}
          onDragOver={(e) => {
            e.preventDefault();
            if (ready) onDrag(true);
          }}
          onDragLeave={() => onDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            onDrag(false);
            if (ready && e.dataTransfer.files[0])
              onDrop(e.dataTransfer.files[0]);
          }}
        >
          <span className="flow-drop-icon" aria-hidden="true">
            ↥
          </span>
          <span>
            <strong>
              {exhausted
                ? "Sign in to open a file"
                : "Drop your Grasshopper file"}
            </strong>
            <small>
              {exhausted
                ? "Your five trial runs are used. Continue with a free account."
                : "or choose a file · .gh / .ghx · up to 20 MB"}
            </small>
          </span>
          <span aria-hidden="true">↗</span>
        </button>
        <div className="flow-start-alternatives">
          <span>No file at hand?</span>
          <button
            className="text-link"
            disabled={!ready}
            onClick={exhausted ? onSignIn : onExample}
          >
            {exhausted ? "Sign in to try the example" : "Try an example"} ↗
          </button>
        </div>
        <p className="flow-cost">
          {usage?.kind === "member"
            ? `${usage.remaining} compute jobs left today.`
            : exhausted
              ? "A free account lets you keep exploring."
              : "Five free geometry runs. No account needed."}{" "}
          Opening a file or the example uses one geometry run.
        </p>
        <div className="flow-entry-footer">
          <button className="quiet" onClick={onLibrary}>
            Open a saved layout →
          </button>
          <span className={"status " + (status?.online ? "online" : "")}>
            <i />
            {serviceLabel(status)}
          </span>
        </div>
        {status && !status.online && (
          <p className="flow-offline" role="status">
            {status.acceptingJobs
              ? "The geometry service is warming up. File actions will become available here."
              : "Cloud geometry is temporarily unavailable. You can still open saved layouts or try the browser study."}
          </p>
        )}
      </div>
      <div className="flow-study">
        <ParametricStudy />
        <p>
          <span className="eyebrow">A SMALL TASTE</span>Move the slider. See the
          idea.
          <small>
            Interactive illustration · runs in your browser · uses no compute
            runs
          </small>
        </p>
      </div>
    </section>
  );
}
