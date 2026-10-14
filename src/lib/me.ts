// Which squad member this phone belongs to, chosen on the phone and kept in
// localStorage. It decides where the Check in control appears and which
// member's private reminders this phone gets. Routing only: it is NOT
// identity (anyone holding the phone can change it).
import { useSyncExternalStore } from "react";

const KEY = "cjo:me";
let me: string | null | undefined; // undefined = not read yet
const listeners = new Set<() => void>();

function read(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null; // private mode / blocked storage: nothing remembered
  }
}

export function getMe(): string | null {
  if (me === undefined) me = typeof window === "undefined" ? null : read();
  return me;
}

export function setMe(id: string | null) {
  me = id;
  try {
    if (id) localStorage.setItem(KEY, id);
    else localStorage.removeItem(KEY);
  } catch {}
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Another tab changed it.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return;
    me = e.newValue;
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** This phone's member id (null on the server and until chosen). */
export function useMe(): string | null {
  return useSyncExternalStore(subscribe, getMe, () => null);
}
