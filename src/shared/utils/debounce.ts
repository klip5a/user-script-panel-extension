export function debounce<F extends (...args: any[]) => void>(fn: F, ms: number) {
  let timeout: any;
  return (...args: Parameters<F>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), ms);
  };
}
