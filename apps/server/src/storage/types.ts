export type Json =
  null | boolean | number | string | Json[] | { [key: string]: Json };
export type Document = Record<string, unknown>;
export type SessionView = "researcher" | "participant";
export interface Agent {
  id: string;
  name: string;
  draft: Document;
  createdAt: string;
  updatedAt: string;
}
export interface Revision {
  id: string;
  agentId: string;
  number: number;
  name: string;
  configuration: Document;
  hash: string;
  parentId: string | null;
  createdAt: string;
}
export interface RatingDefinition {
  id: string;
  question: string;
  min: number;
  max: number;
  lowAnchor: string;
  highAnchor: string;
}
export interface Condition {
  id: string;
  name: string;
  revisionId: string;
  view: SessionView;
  controls: Document;
  estimatedMinutes?: number;
}
export interface ConsentPolicy {
  version: string;
  text: string;
  scope: "study" | "session";
  rawAudio: false;
}
export interface Study {
  id: string;
  name: string;
  question: string;
  task: string;
  conditions: Condition[];
  order: string[];
  ordering: "manual" | "abba";
  measures: RatingDefinition[];
  consentPolicy: ConsentPolicy;
  createdAt: string;
  updatedAt: string;
}
export interface Assignment {
  createdAt: string;
  updatedAt: string;
  studyId: string;
  participantCode: string;
  researcherParticipant: boolean;
  order: string[];
  plannedOrder: string[];
  orderChanges: {
    at: string;
    previous: string[];
    next: string[];
    reason: string;
  }[];
}
export interface Consent {
  id: string;
  studyId: string;
  participantCode: string;
  policyVersion: string;
  policyHash: string;
  acceptedAt: string;
  scope: "study" | "session";
  retentionDays?: number;
  sessionId?: string;
  withdrawnAt?: string;
}
export interface SessionSnapshot {
  protocol?: Pick<Study, "id" | "name" | "question" | "task" | "measures">;
  protocolHash?: string;
  configuration: Document;
  configurationHash: string;
  revisionId?: string;
  condition?: Condition;
  consent?: Consent;
  versions: Document;
  devices: Document;
  rawAudio: false;
  retentionDays?: number;
}
export interface Session {
  id: string;
  kind: "quick" | "study";
  agentId: string;
  studyId?: string;
  conditionId?: string;
  participantCode?: string;
  researcherParticipant: boolean;
  plannedView: SessionView;
  initialView: SessionView;
  view: SessionView;
  state: "active" | "ended" | "interrupted";
  snapshot: SessionSnapshot;
  providerEvidence: Document;
  startedAt: string;
  endedAt?: string;
  protocolDeviations: { at: string; reason: string; eventId?: string }[];
  exclusion?: { reason: string; at: string };
  outcome: Outcome;
  segments: Segment[];
  evidenceSaved: boolean;
  eventCount?: number;
}
export interface Segment {
  id: string;
  sessionId: string;
  startedAt: string;
  reason: string;
  configurationHash: string;
}
export interface EvidenceEvent {
  id: string;
  schemaVersion: "1";
  sessionId: string;
  segmentId?: string;
  sequence: number;
  sourceSequence?: number;
  responseId?: string;
  toolId?: string;
  type: string;
  source: string;
  timestamp: string;
  receivedAt: string;
  monotonicMs: number;
  clock: string;
  payload: Document;
  completeness: "complete" | "partial" | "gap";
  originalEventId?: string;
}
export interface EventInput {
  id?: string;
  segmentId?: string;
  sourceSequence?: number;
  responseId?: string;
  toolId?: string;
  type: string;
  source?: string;
  timestamp?: string;
  payload?: Document;
  completeness?: "complete" | "partial" | "gap";
  originalEventId?: string;
}
export interface Annotation {
  id: string;
  at: string;
  kind: string;
  before: unknown;
  after: unknown;
  reason?: string;
}
export interface Outcome {
  taskSuccess: "success" | "partial" | "failure" | "unknown";
  ratings: Record<string, number | null>;
  notes: string;
  codes: { code: string; eventId?: string; note?: string }[];
  annotations: Annotation[];
}
export interface StartSessionInput {
  id?: string;
  kind: "quick" | "study";
  agentId: string;
  configuration?: Document;
  studyId?: string;
  conditionId?: string;
  participantCode?: string;
  researcherParticipant?: boolean;
  view?: SessionView;
  processingAccepted?: boolean;
  versions?: Document;
  devices?: Document;
}
export interface Metric {
  id: string;
  sessionId: string;
  responseId?: string;
  toolId?: string;
  name:
    | "response-start-latency"
    | "tool-latency"
    | "approval-wait"
    | "response-length";
  definitionVersion: "1";
  value: number | null;
  unit: "ms" | "characters";
  startEventId?: string;
  endEventId?: string;
  clock?: string;
  missingReason?: string;
  toolActive: boolean;
  source: string;
}
export interface ComparisonFilters {
  sessionIds?: string[];
  conditionIds?: string[];
  view?: SessionView | "all";
  researcherParticipant?: boolean | "all";
  includeDeviations?: boolean;
  poolGroups?: boolean;
}
export interface Distribution {
  count: number;
  missing: number;
  median: number | null;
  min: number | null;
  max: number | null;
  values: { sessionId: string; participantCode: string; value: number }[];
}
export interface ComparisonGroup {
  protocol?: SessionSnapshot["protocol"];
  protocolHash?: string;
  conditionSnapshotHash?: string;
  conditionId: string;
  conditionName: string;
  configurationHash: string;
  revisionId?: string;
  view: string;
  researcherParticipant: boolean | "all";
  participantCount: number;
  sessionCount: number;
  turnCount: number;
  responseLatency: Distribution;
  responseLatencyWithTools: Distribution;
  responseLatencyWithoutTools: Distribution;
  toolLatency: Distribution;
  ratings: Record<string, Distribution>;
  outcomes: Record<Outcome["taskSuccess"], number>;
  sessionIds: string[];
}
export interface Comparison {
  schemaVersion: "1";
  studyId: string;
  filters: ComparisonFilters;
  poolingDecision: "separate" | "combined";
  participantCount: number;
  sessionCount: number;
  excluded: { sessionId: string; reasons: string[] }[];
  groups: ComparisonGroup[];
  pairedDifferences: {
    protocolHash?: string;
    fromConfigurationHash?: string;
    toConfigurationHash?: string;
    fromConditionId: string;
    toConditionId: string;
    view: string;
    researcherParticipant: boolean | "all";
    metric: string;
    participantCount: number;
    median: number | null;
    values: { participantCode: string; difference: number }[];
  }[];
  limitations: string[];
}
