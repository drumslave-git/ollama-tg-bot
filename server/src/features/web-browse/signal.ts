/**
 * Decouples "a run was enqueued" (emitted by the browse_web tool) from
 * the runner (which subscribes at startup). Keeps the feature from importing the
 * runtime runner, avoiding an import cycle.
 */
type Listener = () => void;

let listener: Listener | null = null;

export function setRunEnqueuedListener(next: Listener | null): void {
  listener = next;
}

export function emitRunEnqueued(): void {
  listener?.();
}
