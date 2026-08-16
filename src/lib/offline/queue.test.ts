// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";

// Each test imports a fresh copy of the module (vi.resetModules) since
// queue.ts keeps its executor/flushing state at module scope - without
// this, registering an executor in one test would leak into the next.
async function freshQueue() {
  vi.resetModules();
  return import("./queue");
}

beforeEach(() => {
  window.localStorage.clear();
  Object.defineProperty(window.navigator, "onLine", { value: true, configurable: true });
});

describe("offline queue", () => {
  it("persists an enqueued action to localStorage", async () => {
    const { enqueueAction, getQueueSnapshot, registerExecutor } = await freshQueue();
    registerExecutor(async () => new Promise(() => {})); // never resolves - just checking persistence, not flush
    enqueueAction("duty_event", { foo: "bar" }, "fixed-id");
    expect(getQueueSnapshot()).toHaveLength(1);
    expect(getQueueSnapshot()[0].id).toBe("fixed-id");
  });

  it("removes an action from the queue once the executor succeeds", async () => {
    const { enqueueAction, flushQueue, getQueueSnapshot, registerExecutor } = await freshQueue();
    registerExecutor(async () => ({}));
    enqueueAction("arrive_stop", { stopId: "s1" });
    await flushQueue();
    expect(getQueueSnapshot()).toHaveLength(0);
  });

  it("keeps a failed action in the queue and records the attempt", async () => {
    const { enqueueAction, flushQueue, getQueueSnapshot, registerExecutor } = await freshQueue();
    registerExecutor(async () => ({ error: "network down" }));
    enqueueAction("arrive_stop", { stopId: "s1" });
    await flushQueue();
    const queue = getQueueSnapshot();
    expect(queue).toHaveLength(1);
    expect(queue[0].attempts).toBe(1);
    expect(queue[0].lastError).toBe("network down");
  });

  it("does not attempt to flush while offline", async () => {
    const { enqueueAction, flushQueue, getQueueSnapshot, registerExecutor } = await freshQueue();
    const executor = vi.fn(async () => ({}));
    registerExecutor(executor);
    Object.defineProperty(window.navigator, "onLine", { value: false, configurable: true });
    enqueueAction("duty_event", {});
    await flushQueue();
    expect(executor).not.toHaveBeenCalled();
    expect(getQueueSnapshot()).toHaveLength(1);
  });

  it("notifies subscribers when the queue changes", async () => {
    const { enqueueAction, subscribeQueue, registerExecutor } = await freshQueue();
    registerExecutor(async () => new Promise(() => {}));
    const seen: number[] = [];
    const unsubscribe = subscribeQueue((queue) => seen.push(queue.length));
    enqueueAction("duty_event", {});
    unsubscribe();
    // Initial call on subscribe (0), then one more after enqueue (1).
    expect(seen).toEqual([0, 1]);
  });
});
