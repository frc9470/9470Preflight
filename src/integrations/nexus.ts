import { buildMatchCard, inferAllianceColor, sortMatches, teamKeyToNumber } from "@/src/integrations/normalize";
import type { MatchCard } from "@/src/types/domain";

const DEFAULT_NEXUS_BASE_URL = "https://nexus.firstinspires.org";
const FETCH_TIMEOUT_MS = 5500;

type FetchNexusOptions = {
  eventKey: string;
  teamNumber: number;
  leadMinutes: number;
};

export class NexusUnavailableError extends Error {}
export class NexusInvalidPayloadError extends Error {}

function readArrayAtPaths(payload: unknown, paths: string[]): unknown[] | null {
  for (const path of paths) {
    const segments = path.split(".");
    let cursor: unknown = payload;
    for (const segment of segments) {
      if (!cursor || typeof cursor !== "object") {
        cursor = null;
        break;
      }
      cursor = (cursor as Record<string, unknown>)[segment];
    }
    if (Array.isArray(cursor)) {
      return cursor;
    }
  }
  return null;
}

function extractMatches(payload: unknown): unknown[] | null {
  if (Array.isArray(payload)) {
    return payload;
  }
  return readArrayAtPaths(payload, ["matches", "data.matches", "schedule.matches", "matchSchedule"]);
}

function toNumber(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.trunc(raw);
  }
  if (typeof raw === "string") {
    const match = raw.match(/(\d+)/);
    if (!match) {
      return null;
    }
    const parsed = Number(match[1]);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (raw && typeof raw === "object") {
    const object = raw as Record<string, unknown>;
    return toNumber(object.teamNumber ?? object.team_number ?? object.team ?? object.key ?? object.id);
  }
  return null;
}

function toTeamNumbers(raw: unknown): number[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const teams: number[] = [];
  for (const item of raw) {
    if (typeof item === "string") {
      const keyParsed = teamKeyToNumber(item);
      if (keyParsed) {
        teams.push(keyParsed);
        continue;
      }
    }

    const parsed = toNumber(item);
    if (parsed) {
      teams.push(parsed);
    }
  }

  return teams;
}

function pickField(record: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) {
      return record[key];
    }
  }
  return null;
}

function parseSingleMatch(raw: unknown, opts: FetchNexusOptions): MatchCard | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const match = raw as Record<string, unknown>;

  const matchNumber = Number(
    pickField(match, ["matchNumber", "match_number", "number", "sequence"])
  );

  if (!Number.isFinite(matchNumber)) {
    return null;
  }

  const alliances = (match.alliances as Record<string, unknown> | undefined) ?? {};

  const redTeams = toTeamNumbers(
    pickField(match, ["redTeams", "red_alliance_teams"]) ??
      (alliances.red as Record<string, unknown> | undefined)?.teams
  );
  const blueTeams = toTeamNumbers(
    pickField(match, ["blueTeams", "blue_alliance_teams"]) ??
      (alliances.blue as Record<string, unknown> | undefined)?.teams
  );

  if (inferAllianceColor(opts.teamNumber, redTeams, blueTeams) === "unknown") {
    return null;
  }

  const compLevel = String(pickField(match, ["compLevel", "comp_level", "level", "tournamentLevel"]) ?? "qm");

  const expectedStartTimeRaw = pickField(match, [
    "expectedStartTime",
    "expected_start_time",
    "estimatedStartTime",
    "estimated_start_time",
    "scheduledStartTime",
    "scheduled_start_time",
    "startTime",
    "start_time"
  ]);

  const queueTimeRaw = pickField(match, [
    "queueTime",
    "queue_time",
    "estimatedQueueTime",
    "estimated_queue_time",
    "callToQueueTime",
    "call_to_queue_time"
  ]);

  const onDeckTimeRaw = pickField(match, [
    "onDeckTime",
    "on_deck_time",
    "estimatedOnDeckTime",
    "estimated_on_deck_time"
  ]);

  const onFieldTimeRaw = pickField(match, [
    "onFieldTime",
    "on_field_time",
    "estimatedOnFieldTime",
    "estimated_on_field_time"
  ]);

  const completed = Boolean(
    pickField(match, ["actualStartTime", "actual_start_time", "completed", "isComplete", "score_breakdown"])
  );

  const matchKey = String(
    pickField(match, ["key", "matchKey", "id"]) ?? `${opts.eventKey}_${compLevel.toLowerCase()}${Math.trunc(matchNumber)}`
  );

  return buildMatchCard({
    matchKey,
    source: "NEXUS",
    compLevelRaw: compLevel,
    matchNumber: Math.trunc(matchNumber),
    teamNumber: opts.teamNumber,
    redTeams,
    blueTeams,
    expectedStartTimeRaw,
    queueTimeRaw,
    onDeckTimeRaw,
    onFieldTimeRaw,
    completed,
    leadMinutes: opts.leadMinutes
  });
}

export async function fetchNexusMatches(opts: FetchNexusOptions): Promise<MatchCard[]> {
  const apiKey = process.env.NEXUS_API_KEY;
  if (!apiKey) {
    throw new NexusUnavailableError("NEXUS_API_KEY is not configured");
  }

  const baseUrl = process.env.NEXUS_BASE_URL ?? DEFAULT_NEXUS_BASE_URL;
  const endpoint = `${baseUrl.replace(/\/$/, "")}/api/v1/event/${encodeURIComponent(opts.eventKey)}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(endpoint, {
      headers: {
        "X-API-Key": apiKey,
        Accept: "application/json"
      },
      signal: controller.signal,
      cache: "no-store"
    });
  } catch (error) {
    throw new NexusUnavailableError(`Nexus request failed: ${(error as Error).message}`);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new NexusUnavailableError(`Nexus responded with ${response.status}`);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    throw new NexusInvalidPayloadError(`Nexus JSON parse failed: ${(error as Error).message}`);
  }

  const rawMatches = extractMatches(payload);
  if (!rawMatches) {
    throw new NexusInvalidPayloadError("Nexus payload does not contain a match array");
  }

  const cards = rawMatches
    .map((match) => parseSingleMatch(match, opts))
    .filter((card): card is MatchCard => card !== null);

  return sortMatches(cards);
}
