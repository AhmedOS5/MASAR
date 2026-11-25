"use client";

import { useSyncExternalStore } from "react";

// A small localStorage-backed preference store read through useSyncExternalStore, so components never call setState
// from an effect just to pick up a saved value. Pages are pre-rendered, so the server snapshot (the default) is used
// for the first render and hydration; React then switches to the stored value on the client.

const listeners = new Set();
const memory = new Map(); // storage blocked (private mode, policy): the choice still applies for this visit

function subscribe(onChange) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange); // another tab changed it
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function readRaw(key) {
  if (memory.has(key)) return memory.get(key);
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStoredPreference(key, value) {
  try {
    localStorage.setItem(key, value);
    memory.delete(key);
  } catch {
    memory.set(key, value);
  }
  listeners.forEach((fn) => fn());
}

/**
 * The saved value for `key`, passed through `parse` (raw string or null → a primitive, so snapshots compare equal).
 * `serverValue` is what pre-rendered markup and the hydration pass see.
 */
export default function useStoredPreference(key, parse, serverValue) {
  return useSyncExternalStore(
    subscribe,
    () => parse(readRaw(key)),
    () => serverValue,
  );
}
