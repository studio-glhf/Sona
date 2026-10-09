import type { ActionRecord } from "./actions.js";
import { canonicalHash } from "./canonical.js";

/** Deterministic proposal content. The caller must read all material arguments and destination. */
export function actionProposalText(
  action: ActionRecord,
  args: Record<string, unknown>,
  language: "en" | "ko" = "en",
): string {
  if (canonicalHash(args) !== action.argumentsHash)
    throw new Error("Proposal arguments changed. Make a new proposal.");
  const flatten = (value: unknown, path = ""): string[] => {
    if (value && typeof value === "object")
      return Object.entries(value).flatMap(([key, child]) =>
        flatten(child, path ? `${path} ${key}` : key),
      );
    return [`${path}: ${value === null ? "null" : String(value)}`];
  };
  const details = flatten(args).join(". ");
  const destination = action.resource ?? action.connectionId;
  return language === "ko"
    ? `작업: ${action.toolName}. 대상: ${destination}. 세부 사항: ${details}. 이 작업을 승인하려면 네라고 말하고, 거부하려면 아니요라고 말하세요.`
    : `Action: ${action.toolName}. Destination: ${destination}. Details: ${details}. Say yes to approve this action, or no to reject it.`;
}

/** Conservative: punctuation is immaterial; missing or changed words block delivery. */
export function proposalTranscriptMatches(
  expected: string,
  generated: string,
): boolean {
  const normalize = (text: string) =>
    text
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim()
      .replace(/\s+/g, " ");
  return (
    normalize(expected).length > 0 &&
    normalize(expected) === normalize(generated)
  );
}
