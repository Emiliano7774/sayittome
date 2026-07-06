let shuffleRevealDeferred = false;
let deferSourcePath = "/chats";
let shuffleSurfacePresented = false;
let handoffVersion = 0;
const listeners = new Set<() => void>();

function notify() {
  handoffVersion += 1;
  listeners.forEach((listener) => listener());
}

export function subscribeShuffleHandoffState(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getShuffleHandoffVersion() {
  return handoffVersion;
}

export function isShuffleRevealDeferred() {
  return shuffleRevealDeferred;
}

export function getShuffleDeferSourcePath() {
  return deferSourcePath;
}

export function isShuffleSurfacePresented() {
  return shuffleSurfacePresented;
}

export function beginShuffleRevealDeferred(sourcePath: string) {
  deferSourcePath = sourcePath;
  shuffleRevealDeferred = true;
  shuffleSurfacePresented = false;
  notify();
}

export function presentShuffleSurface() {
  shuffleRevealDeferred = false;
  shuffleSurfacePresented = true;
  notify();
}

export function clearShuffleHandoffState() {
  if (!shuffleRevealDeferred && !shuffleSurfacePresented) return;
  shuffleRevealDeferred = false;
  shuffleSurfacePresented = false;
  notify();
}
