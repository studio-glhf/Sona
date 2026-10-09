import { describe, expect, it, vi } from "vitest";
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
      verification: { state: "unchecked", checkedAt: null, reason: null },
    });
    expect(credentials.remove().openai).toEqual({
      configured: false,
      source: "none",
      storage: "memory",
      verification: { state: "unchecked", checkedAt: null, reason: null },
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

  it("coalesces checks, locks key changes, and resets the result for another key", async () => {
    const credentials = new SessionCredentials({});
    credentials.set(first);
    let complete!: (outcome: { state: "verified"; reason: null }) => void;
    const check = vi.fn(
      () =>
        new Promise<{ state: "verified"; reason: null }>((resolve) => {
          complete = resolve;
        }),
    );
    const a = credentials.verify(check);
    const b = credentials.verify(check);
    expect(a).toBe(b);
    expect(credentials.status().openai.verification.state).toBe("checking");
    await Promise.resolve();
    expect(check).toHaveBeenCalledOnce();
    expect(check).toHaveBeenCalledWith(first);
    expect(() => credentials.set(second)).toThrow(
      "active test or API operation",
    );
    expect(() => credentials.remove()).toThrow("active test or API operation");
    complete({ state: "verified", reason: null });
    const result = await a;
    expect(result.openai.verification).toEqual({
      state: "verified",
      checkedAt: expect.any(String),
      reason: null,
    });
    credentials.set(second);
    expect(credentials.status().openai.verification).toEqual({
      state: "unchecked",
      checkedAt: null,
      reason: null,
    });
    await credentials.verify(async () => ({
      state: "rejected",
      reason: "authentication",
    }));
    credentials.remove();
    expect(credentials.status().openai.verification.state).toBe("unchecked");
    expect(() => credentials.verify(check)).toThrow(
      expect.objectContaining({
        statusCode: 400,
        code: "MISSING_PROJECT_API_KEY",
      }),
    );
  });

  it("does not restore a stale verification after server shutdown clears credentials", async () => {
    const credentials = new SessionCredentials({});
    credentials.set(first);
    let complete!: (outcome: { state: "verified"; reason: null }) => void;
    const pending = credentials.verify(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    await Promise.resolve();
    credentials.clear();
    complete({ state: "verified", reason: null });
    expect((await pending).openai).toEqual({
      configured: false,
      source: "none",
      storage: "memory",
      verification: { state: "unchecked", checkedAt: null, reason: null },
    });
    credentials.set(second);
    expect(credentials.status().openai.verification.state).toBe("unchecked");
    expect(
      new SessionCredentials({ OPENAI_API_KEY: first }).status().openai
        .verification.state,
    ).toBe("unchecked");
  });
});
