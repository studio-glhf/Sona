import { describe, expect, it } from "vitest";
import { SessionCredentials } from "./credentials.js";

const first = "sk-proj-synthetic_canary_first_credential";
const second = "sk-proj-synthetic_canary_second_credential";

describe("server-run project credentials", () => {
  it("checks project key format without provider access and disables an environment seed on removal", () => {
    const credentials = new SessionCredentials({ OPENAI_API_KEY: first });
    expect(credentials.status().openai.source).toBe("environment");
    expect(() => credentials.set("not a key")).toThrow("project API key");
    expect(() => credentials.set("not a key")).toThrow(
      expect.objectContaining({
        statusCode: 400,
        code: "INVALID_PROJECT_API_KEY",
      }),
    );
    expect(() =>
      credentials.set("sk-admin-synthetic_admin_credential"),
    ).toThrow("project API key");
    expect(credentials.set(`  ${second}  `).openai).toEqual({
      configured: true,
      source: "session",
      storage: "memory",
    });
    expect(credentials.remove().openai).toEqual({
      configured: false,
      source: "none",
      storage: "memory",
    });
    expect(credentials.apiKey).toBeUndefined();
    expect(credentials.safe(`${first},${second}`)).toBe(
      "[REDACTED],[REDACTED]",
    );
    credentials.clear();
    expect(credentials.secrets).toEqual([]);
    expect(new SessionCredentials({}).status().openai.configured).toBe(false);
  });

  it("holds the exact credential for every in-flight lease and makes release idempotent", () => {
    const credentials = new SessionCredentials({});
    credentials.set(first);
    const a = credentials.acquire(),
      b = credentials.acquire();
    expect(a.credentials.project).toBe(first);
    expect(() => credentials.set(second)).toThrow(
      "active test or API operation",
    );
    expect(() => credentials.remove()).toThrow("active test or API operation");
    a.release();
    a.release();
    expect(() => credentials.remove()).toThrow("active test or API operation");
    b.release();
    credentials.set(second);
    expect(a.credentials.project).toBe(first);
    expect(credentials.apiKey).toBe(second);
  });
});
