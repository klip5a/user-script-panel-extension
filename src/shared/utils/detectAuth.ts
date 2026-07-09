export function detectAuth() {
  if (typeof document === "undefined") {
    return { authorized: true, inAdmin: true };
  }
  return { authorized: true, inAdmin: true };
}
