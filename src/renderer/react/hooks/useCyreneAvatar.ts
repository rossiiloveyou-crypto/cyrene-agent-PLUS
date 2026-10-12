import { useSyncExternalStore } from "react";
import { resolveAsset } from "../../../shared/renderer-base";

export function getDefaultCyreneAvatarUrl(): string {
  return resolveAsset("avatars/cyrene-avatar.png");
}

const DEFAULT_AVATAR = getDefaultCyreneAvatarUrl();
let currentAvatar = DEFAULT_AVATAR;
let loadGeneration = 0;
const subscribers = new Set<() => void>();
let unsubscribeFromMain: (() => void) | undefined;

function notifySubscribers(): void {
  for (const subscriber of subscribers) subscriber();
}

async function refreshAvatar(): Promise<void> {
  const generation = ++loadGeneration;
  try {
    const nextAvatar = await window.cyreneAvatar?.get();
    if (generation !== loadGeneration) return;
    currentAvatar = nextAvatar || DEFAULT_AVATAR;
  } catch {
    if (generation !== loadGeneration) return;
    currentAvatar = DEFAULT_AVATAR;
  }
  notifySubscribers();
}

function subscribe(listener: () => void): () => void {
  subscribers.add(listener);
  if (subscribers.size === 1) {
    unsubscribeFromMain = window.cyreneAvatar?.onChanged(() => { void refreshAvatar(); });
    void refreshAvatar();
  }
  return () => {
    subscribers.delete(listener);
    if (subscribers.size === 0) {
      unsubscribeFromMain?.();
      unsubscribeFromMain = undefined;
    }
  };
}

function getSnapshot(): string {
  return currentAvatar;
}

export function useCyreneAvatar(): string {
  return useSyncExternalStore(subscribe, getSnapshot, () => DEFAULT_AVATAR);
}
