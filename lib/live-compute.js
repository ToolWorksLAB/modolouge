// One debounced solve at a time. Only the latest values survive a burst of edits.
export function createLiveScheduler({
  run,
  onFailure,
  schedule = setTimeout,
  cancel = clearTimeout,
  delay = 650,
}) {
  let state,
    timer,
    running = false,
    attempted = null,
    disposed = false;
  function clear() {
    if (timer != null) cancel(timer);
    timer = null;
  }
  function update(next) {
    state = next;
    clear();
    if (!next.enabled || !next.dirty) attempted = null;
    if (
      disposed ||
      running ||
      !next.enabled ||
      !next.ready ||
      !next.dirty ||
      next.busy ||
      next.interacting ||
      !next.visible ||
      attempted === next.signature
    )
      return;
    timer = schedule(async () => {
      timer = null;
      running = true;
      attempted = state.signature;
      try {
        if ((await run()) === false && !disposed) onFailure();
      } catch {
        if (!disposed) onFailure();
      } finally {
        running = false;
        if (!disposed) update(state);
      }
    }, delay);
  }
  return {
    update,
    dispose() {
      disposed = true;
      clear();
    },
  };
}
