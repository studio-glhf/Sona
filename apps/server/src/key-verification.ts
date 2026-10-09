import OpenAI from "openai";

export type KeyVerificationReason =
  | "authentication"
  | "permission"
  | "rate_limit"
  | "timeout"
  | "network"
  | "service"
  | "response";
export interface KeyVerificationOutcome {
  state: "verified" | "rejected" | "unavailable";
  reason: KeyVerificationReason | null;
}

/** Checks authentication with a model-list read, never a model invocation. */
export async function verifyOpenAIKey(
  apiKey: string,
): Promise<KeyVerificationOutcome> {
  const deadline = AbortSignal.timeout(10_000);
  try {
    const client = new OpenAI({
      apiKey,
      baseURL: "https://api.openai.com/v1",
      timeout: 10_000,
      maxRetries: 0,
    });
    const response = await client.models
      .list({ signal: deadline })
      .asResponse();
    // Page.data defaults to [] in the SDK. Check the actual response body.
    const body: unknown = await response.json();
    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body) ||
      !("object" in body) ||
      body.object !== "list" ||
      !("data" in body) ||
      !Array.isArray(body.data)
    )
      return { state: "unavailable", reason: "response" };
    return { state: "verified", reason: null };
  } catch (error) {
    // Provider messages and headers can contain secrets. Return only known codes.
    if (deadline.aborted) return { state: "unavailable", reason: "timeout" };
    if (error instanceof OpenAI.AuthenticationError)
      return { state: "rejected", reason: "authentication" };
    if (error instanceof OpenAI.PermissionDeniedError)
      return { state: "unavailable", reason: "permission" };
    if (error instanceof OpenAI.RateLimitError)
      return { state: "unavailable", reason: "rate_limit" };
    if (error instanceof OpenAI.APIConnectionTimeoutError)
      return { state: "unavailable", reason: "timeout" };
    if (error instanceof OpenAI.APIConnectionError)
      return { state: "unavailable", reason: "network" };
    if (error instanceof OpenAI.InternalServerError)
      return { state: "unavailable", reason: "service" };
    return { state: "unavailable", reason: "response" };
  }
}
