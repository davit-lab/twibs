import { useEffect, useState } from 'react';

/**
 * Tiny global store so full-screen experiences (StoryViewer, CameraModal,
 * StoryCreator) can temporarily hide the minimized call UI without ending the
 * call. The mini player checks `isCallOverlayBlocked()` before rendering.
 */

type Listener = () => void;

let blocked = false;
let blockedBy = 0;
const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) l();
}

export function blockCallOverlay() {
  blockedBy += 1;
  if (!blocked) {
    blocked = true;
    emit();
  }
}

export function unblockCallOverlay() {
  blockedBy = Math.max(0, blockedBy - 1);
  if (blockedBy === 0 && blocked) {
    blocked = false;
    emit();
  }
}

export function isCallOverlayBlocked(): boolean {
  return blocked;
}

/** Convenience hook for the mini player. */
export function useCallOverlayBlocked(): boolean {
  const [value, setValue] = useState(blocked);
  useEffect(() => {
    const listener = () => setValue(blocked);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return value;
}