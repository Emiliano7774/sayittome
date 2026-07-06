type ShuffleHandler = () => void;

let activeHandler: ShuffleHandler | null = null;
const queuedTriggers: number[] = [];

export function registerShuffleClickHandler(handler: ShuffleHandler | null) {
  activeHandler = handler;

  if (handler && queuedTriggers.length > 0) {
    const pending = queuedTriggers.splice(0, queuedTriggers.length);
    for (const _ of pending) {
      handler();
    }
  }
}

export function clearQueuedShuffleTriggers() {
  queuedTriggers.length = 0;
}

export function triggerShuffleClick() {
  if (activeHandler) {
    activeHandler();
    return;
  }

  queuedTriggers.push(Date.now());
}
