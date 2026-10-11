import test from "node:test";
import assert from "node:assert/strict";
import { createLiveScheduler } from "../lib/live-compute.js";

function fixture(run = async () => true) {
  const timers = new Map();
  let next = 0,
    calls = 0,
    failures = 0;
  const scheduler = createLiveScheduler({
    run: () => {
      calls++;
      return run();
    },
    onFailure: () => failures++,
    schedule: (fn, ms) => {
      assert.equal(ms, 650);
      timers.set(++next, fn);
      return next;
    },
    cancel: (id) => timers.delete(id),
  });
  let state = {
    enabled: true,
    ready: true,
    dirty: true,
    busy: false,
    interacting: false,
    visible: true,
    signature: "a",
  };
  return {
    update(change = {}) {
      state = { ...state, ...change };
      scheduler.update(state);
    },
    async tick() {
      const pending = [...timers.values()];
      timers.clear();
      await Promise.all(pending.map((fn) => fn()));
    },
    scheduler,
    get timers() {
      return timers.size;
    },
    get calls() {
      return calls;
    },
    get failures() {
      return failures;
    },
  };
}

test("rapid edits debounce into one solve and unchanged inputs never repeat", async () => {
  const f = fixture();
  f.update();
  f.update({ signature: "b" });
  f.update({ signature: "c" });
  assert.equal(f.timers, 1);
  await f.tick();
  f.update();
  await f.tick();
  assert.equal(f.calls, 1);
});
test("live compute waits for pointer release, availability and a visible page", async () => {
  for (const block of [
    { interacting: true },
    { ready: false },
    { busy: true },
    { visible: false },
    { dirty: false },
    { enabled: false },
  ]) {
    const f = fixture();
    f.update(block);
    await f.tick();
    assert.equal(f.calls, 0);
    f.update({
      enabled: true,
      ready: true,
      dirty: true,
      busy: false,
      visible: true,
      interacting: false,
    });
    await f.tick();
    assert.equal(f.calls, 1);
  }
});
test("only the latest edit survives an in-flight solve, without overlapping requests", async () => {
  let finish;
  const f = fixture(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  f.update();
  const first = f.tick();
  f.update({ signature: "b" });
  f.update({ signature: "c" });
  assert.equal(f.timers, 0);
  assert.equal(f.calls, 1);
  finish(true);
  await first;
  assert.equal(f.timers, 1);
  const second = f.tick();
  assert.equal(f.calls, 2);
  finish(true);
  await second;
  assert.equal(f.timers, 0);
});
test("a failed solve pauses once; explicit off/on permits a retry", async () => {
  for (const run of [
    async () => false,
    async () => {
      throw new Error("offline");
    },
  ]) {
    const f = fixture(run);
    f.update();
    await f.tick();
    f.update();
    await f.tick();
    assert.equal(f.calls, 1);
    assert.equal(f.failures, 1);
    f.update({ enabled: false });
    f.update({ enabled: true });
    await f.tick();
    assert.equal(f.calls, 2);
  }
});
test("switching off, manual runs and leaving the definition cancel pending work", async () => {
  const f = fixture();
  f.update();
  f.update({ enabled: false });
  await f.tick();
  assert.equal(f.calls, 0);
  f.update({ enabled: true });
  f.update({ busy: true });
  await f.tick();
  assert.equal(f.calls, 0);
  f.update({ busy: false });
  f.scheduler.dispose();
  await f.tick();
  assert.equal(f.calls, 0);
});

test("a manual solve does not prevent a later automatic return to earlier values", async () => {
  const f = fixture();
  f.update();
  await f.tick();
  f.update({ dirty: false });
  f.update({ signature: "b", dirty: true });
  f.update({ busy: true });
  f.update({ busy: false, dirty: false });
  f.update({ signature: "a", dirty: true });
  await f.tick();
  assert.equal(f.calls, 2);
});
