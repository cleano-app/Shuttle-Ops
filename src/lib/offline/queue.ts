// Offline-first action queue for the driver app (build spec §24: "The app
// updates immediately and syncs when connectivity returns... Actions
// queue locally with client-generated UUIDs and timestamps.") localStorage-
// backed rather than IndexedDB/a service worker — simpler, and sufficient
// for what's actually being queued here (a handful of small JSON actions
// per stop, not files or large payloads). Every queued action's `id` is
// the client-generated UUID also sent as the server call's idempotency
// key (client_id on driver_duty_events, p_client_id on the stop-status
// RPCs), so replaying after a reconnect never double-records anything.

export type QueuedActionType = "arrive_stop" | "depart_stop" | "problem_stop" | "board_passenger" | "duty_event";

export interface QueuedAction {
  id: string;
  type: QueuedActionType;
  payload: Record<string, unknown>;
  createdAt: string;
  attempts: number;
  lastError?: string;
}

const STORAGE_KEY = "shuttleops_offline_queue_v1";

function readQueue(): QueuedAction[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as QueuedAction[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(queue: QueuedAction[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  notifyListeners(queue);
}

type Listener = (queue: QueuedAction[]) => void;
const listeners = new Set<Listener>();

function notifyListeners(queue: QueuedAction[]) {
  listeners.forEach((l) => l(queue));
}

/** Subscribe to queue changes — used by the sync-indicator hook. Returns
 * an unsubscribe function. Immediately calls the listener once with the
 * current queue so callers don't need a separate initial read. */
export function subscribeQueue(listener: Listener): () => void {
  listeners.add(listener);
  listener(readQueue());
  return () => {
    listeners.delete(listener);
  };
}

export function getQueueSnapshot(): QueuedAction[] {
  return readQueue();
}

/**
 * Adds an action to the queue and immediately attempts to flush it (so on
 * a good connection there's no visible delay) — but the action is on disk
 * before that attempt starts, so a dropped connection mid-tap still leaves
 * it durably queued, matching "driver actions are authoritative."
 */
export function enqueueAction(
  type: QueuedActionType,
  payload: Record<string, unknown>,
  id?: string
): string {
  const action: QueuedAction = {
    id: id ?? crypto.randomUUID(),
    type,
    payload,
    createdAt: new Date().toISOString(),
    attempts: 0,
  };
  const queue = readQueue();
  queue.push(action);
  writeQueue(queue);
  void flushQueue();
  return action.id;
}

type Executor = (action: QueuedAction) => Promise<{ error?: string }>;
let executor: Executor | null = null;

/** The driver route screen registers exactly one executor mapping each
 * QueuedActionType to its server action call — kept out of this module so
 * the queue itself has no dependency on "use server" files. */
export function registerExecutor(fn: Executor) {
  executor = fn;
}

let flushing = false;

export async function flushQueue(): Promise<void> {
  if (flushing || !executor || typeof window === "undefined") return;
  if (!window.navigator.onLine) return;

  flushing = true;
  try {
    let queue = readQueue();
    for (const action of queue) {
      try {
        const result = await executor(action);
        if (result.error) {
          queue = queue.map((a) =>
            a.id === action.id ? { ...a, attempts: a.attempts + 1, lastError: result.error } : a
          );
          writeQueue(queue);
        } else {
          queue = queue.filter((a) => a.id !== action.id);
          writeQueue(queue);
        }
      } catch (err) {
        queue = queue.map((a) =>
          a.id === action.id
            ? { ...a, attempts: a.attempts + 1, lastError: err instanceof Error ? err.message : "Unknown error" }
            : a
        );
        writeQueue(queue);
      }
    }
  } finally {
    flushing = false;
  }
}

let initialized = false;

/** Wires up automatic retry on reconnect/refocus. Safe to call more than
 * once (e.g. from multiple mounts of the driver screen) - only attaches
 * the window listeners the first time. */
export function initOfflineQueue() {
  if (typeof window === "undefined" || initialized) return;
  initialized = true;
  window.addEventListener("online", () => void flushQueue());
  window.addEventListener("focus", () => void flushQueue());
  void flushQueue();
}
