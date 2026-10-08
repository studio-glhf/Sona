export type Json = any;
export type Agent = {
  id: string;
  name: string;
  draft: Json;
  updatedAt?: string;
  revisions?: Json[];
};
export type Study = {
  id: string;
  name: string;
  question?: string;
  task?: string;
  conditions: Json[];
  measures?: Json[];
  consentPolicy?: Json;
  order?: Json;
  [key: string]: Json;
};
export type Session = {
  id: string;
  agentId?: string;
  mode?: string;
  status?: string;
  createdAt?: string;
  snapshot?: Json;
  events?: Json[];
  outcome?: Json;
  [key: string]: Json;
};
let localToken = "";
export function setLocalToken(value: string) {
  localToken = value;
}
export async function api<T = Json>(
  path: string,
  body?: unknown,
  method?: string,
): Promise<T> {
  const response = await fetch("/api" + path, {
    method: method ?? (body === undefined ? "GET" : "POST"),
    credentials: "same-origin",
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(localToken ? { "X-Sona-Token": localToken } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response
    .json()
    .catch(() => ({ error: response.statusText }));
  if (!response.ok)
    throw new Error(
      typeof result.error === "string"
        ? result.error
        : (result.error?.message ??
            result.message ??
            `Request failed (${response.status})`),
    );
  return result;
}
export async function download(path: string, name: string) {
  const response = await fetch("/api" + path, {
    headers: localToken ? { "X-Sona-Token": localToken } : {},
  });
  if (!response.ok)
    throw new Error("Export failed. The records remain available.");
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function downloadJson(value: unknown, name: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function collection<T>(value: Json, key: string): T[] {
  return Array.isArray(value)
    ? value
    : Array.isArray(value?.[key])
      ? value[key]
      : [];
}
export function shortId(id: string) {
  return id?.slice(0, 8) ?? "";
}
export function pretty(value: unknown) {
  return JSON.stringify(value, null, 2);
}
