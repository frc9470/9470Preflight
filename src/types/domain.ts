export type MatchStatus = "UPCOMING" | "QUEUE" | "ON_DECK" | "ON_FIELD_SOON" | "COMPLETED";

export type MatchCard = {
  matchKey: string;
  source: "NEXUS" | "TBA" | "MOCK";
  compLevel: "qm" | "qf" | "sf" | "f" | "other";
  matchNumber: number;
  allianceColor: "red" | "blue" | "unknown";
  allianceTeams: number[];
  opponentTeams: number[];
  expectedStartTimeIso: string | null;
  queueTimeIso: string | null;
  onDeckTimeIso: string | null;
  onFieldTimeIso: string | null;
  status: MatchStatus;
  isFallback: boolean;
  lastUpdatedIso: string;
};

export type StepKind = "boolean" | "number" | "counter";

export type ChecklistStep = {
  id: string;
  section: "cold" | "hot";
  category?: string;
  prompt: string;
  kind: StepKind;
  required: true;
  min?: number;
};

export type StepResponse = {
  stepId: string;
  valueBoolean?: boolean;
  valueNumber?: number;
  valueCount?: number;
  passed: boolean;
  overridden: boolean;
  overrideReason?: string;
  inProgress?: boolean;
  actionCardId?: string;
  actionSummary?: string;
  actionAssignee?: string;
  updatedAtIso: string;
};

export type PreflightActionCard = {
  id: string;
  stepId: string;
  stepPrompt: string;
  note: string;
  assignee?: string;
  status: "OPEN" | "DONE";
  createdAtIso: string;
  resolvedAtIso?: string;
};

export type PreflightRunState = "IN_PROGRESS" | "READY" | "BLOCKED";

export type PreflightRun = {
  runId: string;
  eventKey: string;
  matchKey: string;
  state: PreflightRunState;
  startedAtIso: string;
  completedAtIso?: string;
  responses: StepResponse[];
  actionCards: PreflightActionCard[];
};

export type AppSettings = {
  teamNumber: number;
  eventKey: string;
  queueLeadMinutes: number;
  dataMode: "live" | "mock";
};

export type MatchesPayload = {
  matches: MatchCard[];
  source: "NEXUS" | "TBA" | "MOCK";
  isFallback: boolean;
  lastUpdatedIso: string;
};
