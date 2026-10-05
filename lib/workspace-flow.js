export function changedControls(controls = [], values = {}, solved = null) {
  if (!solved) return 0;
  return controls.reduce(
    (count, c) => count + (values[c.name] !== solved[c.name] ? 1 : 0),
    0,
  );
}
export function serviceLabel(status) {
  if (!status) return "Checking availability…";
  if (status.online) return "Ready to compute";
  if (status.acceptingJobs) return "Compute is starting";
  return "Compute is offline";
}
export function runLabel({ busy, exhausted, hasResult, changes }) {
  if (busy) return busy;
  if (exhausted) return "Sign in to continue";
  if (hasResult && !changes) return "Model is up to date";
  return hasResult ? "Update model" : "Generate model";
}
