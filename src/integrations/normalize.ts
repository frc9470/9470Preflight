import type { MatchCard, MatchStatus } from "@/src/types/domain";

export type NormalizedMatchInput = {
  matchKey: string;
  source: "NEXUS" | "TBA" | "MOCK";
  compLevelRaw?: string | null;
  matchNumber: number;
  teamNumber: number;
  redTeams: number[];
  blueTeams: number[];
  expectedStartTimeRaw?: unknown;
  queueTimeRaw?: unknown;
  onDeckTimeRaw?: unknown;
  onFieldTimeRaw?: unknown;
  completed?: boolean;
  leadMinutes: number;
};

const SOON_THRESHOLD_MS = 2 * 60 * 1000;

function normalizeCompLevel(compLevelRaw?: string | null): MatchCard["compLevel"] {
  if (!compLevelRaw) {
    return "other";
  }
  const value = compLevelRaw.toLowerCase();
  if (value === "qm" || value.includes("qual")) {
    return "qm";
  }
  if (value === "qf" || value.includes("quarter")) {
    return "qf";
  }
  if (value === "sf" || value.includes("semi")) {
    return "sf";
  }
  if (value === "f" || value.includes("final")) {
    return "f";
  }
  return "other";
}

function parseDateLike(raw: unknown): Date | null {
  if (raw === null || raw === undefined || raw === "") {
    return null;
  }

  if (typeof raw === "number" && Number.isFinite(raw)) {
    const ms = raw < 10_000_000_000 ? raw * 1000 : raw;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) {
      return null;
    }

    if (/^\d+$/.test(trimmed)) {
      const asNum = Number(trimmed);
      if (Number.isFinite(asNum)) {
        const ms = asNum < 10_000_000_000 ? asNum * 1000 : asNum;
        const date = new Date(ms);
        return Number.isNaN(date.getTime()) ? null : date;
      }
    }

    const date = new Date(trimmed);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  return null;
}

function toIso(raw: unknown): string | null {
  const date = parseDateLike(raw);
  return date ? date.toISOString() : null;
}

function inferExpectedStart(input: NormalizedMatchInput): string | null {
  const directExpected = toIso(input.expectedStartTimeRaw);
  if (directExpected) {
    return directExpected;
  }

  const onField = parseDateLike(input.onFieldTimeRaw);
  if (onField) {
    return onField.toISOString();
  }

  const onDeck = parseDateLike(input.onDeckTimeRaw);
  if (onDeck) {
    return new Date(onDeck.getTime() + 5 * 60 * 1000).toISOString();
  }

  const queue = parseDateLike(input.queueTimeRaw);
  if (queue) {
    return new Date(queue.getTime() + 10 * 60 * 1000).toISOString();
  }

  return null;
}

function inferQueueTime(input: NormalizedMatchInput, expectedStartIso: string | null): string | null {
  const directQueue = toIso(input.queueTimeRaw);
  if (directQueue) {
    return directQueue;
  }

  if (!expectedStartIso) {
    return null;
  }

  const expected = parseDateLike(expectedStartIso);
  if (!expected) {
    return null;
  }

  return new Date(expected.getTime() - input.leadMinutes * 60 * 1000).toISOString();
}

function deriveStatus(
  now: Date,
  completed: boolean,
  queueIso: string | null,
  onDeckIso: string | null,
  onFieldIso: string | null
): MatchStatus {
  if (completed) {
    return "COMPLETED";
  }

  const queue = parseDateLike(queueIso);
  const onDeck = parseDateLike(onDeckIso);
  const onField = parseDateLike(onFieldIso);

  if (onField && now.getTime() >= onField.getTime() - SOON_THRESHOLD_MS) {
    return "ON_FIELD_SOON";
  }

  if (onDeck && now.getTime() >= onDeck.getTime() - SOON_THRESHOLD_MS) {
    return "ON_DECK";
  }

  if (queue && now.getTime() >= queue.getTime() - SOON_THRESHOLD_MS) {
    return "QUEUE";
  }

  return "UPCOMING";
}

function sanitizeTeams(teams: number[]): number[] {
  return teams.filter((team) => Number.isInteger(team) && team > 0);
}

export function teamKeyToNumber(teamKey: string): number | null {
  if (!teamKey) {
    return null;
  }
  const match = teamKey.match(/(\d+)/);
  if (!match) {
    return null;
  }
  const number = Number(match[1]);
  return Number.isInteger(number) && number > 0 ? number : null;
}

export function inferAllianceColor(teamNumber: number, redTeams: number[], blueTeams: number[]): MatchCard["allianceColor"] {
  if (redTeams.includes(teamNumber)) {
    return "red";
  }
  if (blueTeams.includes(teamNumber)) {
    return "blue";
  }
  return "unknown";
}

export function buildMatchCard(input: NormalizedMatchInput, now = new Date()): MatchCard {
  const redTeams = sanitizeTeams(input.redTeams);
  const blueTeams = sanitizeTeams(input.blueTeams);
  const allianceColor = inferAllianceColor(input.teamNumber, redTeams, blueTeams);
  const allianceTeams = allianceColor === "red" ? redTeams : allianceColor === "blue" ? blueTeams : [];
  const opponentTeams = allianceColor === "red" ? blueTeams : allianceColor === "blue" ? redTeams : [];

  const expectedStartTimeIso = inferExpectedStart(input);
  const queueTimeIso = inferQueueTime(input, expectedStartTimeIso);
  const onDeckTimeIso = toIso(input.onDeckTimeRaw);
  const onFieldTimeIso = toIso(input.onFieldTimeRaw);

  return {
    matchKey: input.matchKey,
    source: input.source,
    compLevel: normalizeCompLevel(input.compLevelRaw),
    matchNumber: input.matchNumber,
    allianceColor,
    allianceTeams,
    opponentTeams,
    expectedStartTimeIso,
    queueTimeIso,
    onDeckTimeIso,
    onFieldTimeIso,
    status: deriveStatus(now, Boolean(input.completed), queueTimeIso, onDeckTimeIso, onFieldTimeIso),
    isFallback: false,
    lastUpdatedIso: now.toISOString()
  };
}

export function sortMatches(matches: MatchCard[]): MatchCard[] {
  return [...matches].sort((a, b) => {
    const aTime = parseDateLike(a.expectedStartTimeIso)?.getTime() ?? Number.POSITIVE_INFINITY;
    const bTime = parseDateLike(b.expectedStartTimeIso)?.getTime() ?? Number.POSITIVE_INFINITY;
    if (aTime !== bTime) {
      return aTime - bTime;
    }
    return a.matchNumber - b.matchNumber;
  });
}
