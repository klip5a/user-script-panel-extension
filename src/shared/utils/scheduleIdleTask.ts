export type IdleDeadlineLike = {
  didTimeout: boolean;
  timeRemaining: () => number;
};

type WindowWithIdleCallback = Window & {
  requestIdleCallback?: (
    callback: (deadline: IdleDeadlineLike) => void,
    options?: { timeout: number },
  ) => number;
  cancelIdleCallback?: (handle: number) => void;
};

// Единая обертка над requestIdleCallback: переносит тяжелые DOM-сканы в свободное время браузера.
export function scheduleIdleTask(
  callback: (deadline: IdleDeadlineLike) => void,
  timeout = 1000,
): number {
  const targetWindow = window as WindowWithIdleCallback;

  if (targetWindow.requestIdleCallback) {
    return targetWindow.requestIdleCallback(callback, { timeout });
  }

  return window.setTimeout(() => {
    callback({
      didTimeout: true,
      timeRemaining: () => 0,
    });
  }, 0);
}

export function cancelIdleTask(handle: number): void {
  const targetWindow = window as WindowWithIdleCallback;

  if (targetWindow.cancelIdleCallback) {
    targetWindow.cancelIdleCallback(handle);
    return;
  }

  window.clearTimeout(handle);
}
