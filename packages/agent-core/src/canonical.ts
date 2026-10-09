import { createHash } from "node:crypto";

export function canonicalJson(value: unknown): string {
  function canonical(input: unknown): unknown {
    if (
      input === null ||
      typeof input === "string" ||
      typeof input === "boolean"
    )
      return input;
    if (typeof input === "number" && Number.isFinite(input)) return input;
    if (Array.isArray(input)) return input.map(canonical);
    if (
      input &&
      typeof input === "object" &&
      Object.getPrototypeOf(input) === Object.prototype
    ) {
      return Object.fromEntries(
        Object.keys(input)
          .sort()
          .map((key) => [
            key,
            canonical((input as Record<string, unknown>)[key]),
          ]),
      );
    }
    throw new Error(
      "The configuration must contain JSON values. Omit absent fields.",
    );
  }
  return JSON.stringify(canonical(value));
}

export function canonicalHash(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

export function immutableCopy<T>(value: T): Readonly<T> {
  const freeze = (item: unknown): void => {
    if (item && typeof item === "object") {
      Object.values(item).forEach(freeze);
      Object.freeze(item);
    }
  };
  const copy = structuredClone(value);
  freeze(copy);
  return copy;
}
