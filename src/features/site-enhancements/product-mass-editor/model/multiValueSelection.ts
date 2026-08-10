export type MultiValueMode = "replace" | "add" | "remove" | "clear";

export function resolveMultiValueSelection(
  currentValues: Iterable<string>,
  requestedValues: Iterable<string>,
  mode: string,
): Set<string> {
  const current = new Set(currentValues);
  const requested = new Set(requestedValues);

  switch (mode as MultiValueMode) {
    case "replace":
      return requested;
    case "add":
      requested.forEach((value) => current.add(value));
      return current;
    case "remove":
      requested.forEach((value) => current.delete(value));
      return current;
    case "clear":
      return new Set<string>();
    default:
      return current;
  }
}
