import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyOpenAIKey } from "./key-verification.js";

const key = "sk-proj-synthetic_verification_transport_canary";
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("OpenAI model-list key check", () => {
  it.each([
    [200, { object: "list", data: [] }, "verified", null],
    [
      401,
      { error: { message: `Sensitive provider message ${key}` } },
      "rejected",
      "authentication",
    ],
    [
      403,
      { error: { message: `Sensitive provider message ${key}` } },
      "unavailable",
      "permission",
    ],
    [
      429,
      { error: { message: `Sensitive provider message ${key}` } },
      "unavailable",
      "rate_limit",
    ],
    [
      503,
      { error: { message: `Sensitive provider message ${key}` } },
      "unavailable",
      "service",
    ],
    [
      400,
      { error: { message: `Sensitive provider message ${key}` } },
      "unavailable",
      "response",
    ],
    [200, { object: "list" }, "unavailable", "response"],
    [200, { object: "list", data: {} }, "unavailable", "response"],
    [200, { object: "other", data: [] }, "unavailable", "response"],
    [200, [], "unavailable", "response"],
    [200, null, "unavailable", "response"],
  ])(
    "maps fixture %i to safe outcome %s",
    async (status, body, state, reason) => {
      const fetch = vi.fn(async (url, init) => {
        if (url === "data:,") return new Response("");
        expect(String(url)).toBe("https://api.openai.com/v1/models");
        expect(init.method).toBe("GET");
        expect(new Headers(init.headers).get("authorization")).toBe(
          `Bearer ${key}`,
        );
        return new Response(JSON.stringify(body), {
          status,
          headers: {
            "content-type": "application/json",
            "x-request-id": `sensitive_${key}`,
          },
        });
      });
      vi.stubGlobal("fetch", fetch);
      const outcome = await verifyOpenAIKey(key);
      expect(outcome).toEqual({ state, reason });
      expect(JSON.stringify(outcome)).not.toContain(key);
      expect(fetch.mock.calls.filter(([url]) => url !== "data:,")).toHaveLength(
        1,
      );
    },
  );

  it("maps a connection failure without provider or transport error text", async () => {
    const fetch = vi.fn(async (url) => {
      if (url === "data:,") return new Response("");
      throw new TypeError(`Network detail containing ${key}`);
    });
    vi.stubGlobal("fetch", fetch);
    expect(await verifyOpenAIKey(key)).toEqual({
      state: "unavailable",
      reason: "network",
    });
    expect(fetch.mock.calls.filter(([url]) => url !== "data:,")).toHaveLength(
      1,
    );
  });

  it("uses the ten-second SDK timeout without retries", async () => {
    vi.useFakeTimers();
    let started!: () => void;
    const fetched = new Promise<void>((resolve) => {
      started = resolve;
    });
    const fetch = vi.fn((url, init) => {
      if (url === "data:,") return Promise.resolve(new Response(""));
      started();
      return new Promise<Response>((_resolve, reject) => {
        init.signal.addEventListener(
          "abort",
          () => reject(new DOMException("Fixture timeout", "AbortError")),
          { once: true },
        );
      });
    });
    vi.stubGlobal("fetch", fetch);
    const pending = verifyOpenAIKey(key);
    await fetched;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await pending).toEqual({ state: "unavailable", reason: "timeout" });
    expect(fetch.mock.calls.filter(([url]) => url !== "data:,")).toHaveLength(
      1,
    );
  });

  it("rejects non-JSON response content", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) =>
        url === "data:,"
          ? new Response("")
          : new Response("not JSON", {
              headers: { "content-type": "application/json" },
            }),
      ),
    );
    expect(await verifyOpenAIKey(key)).toEqual({
      state: "unavailable",
      reason: "response",
    });
  });
});
