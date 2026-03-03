import { buildMatchCard, inferAllianceColor, sortMatches, teamKeyToNumber } from "@/src/integrations/normalize";
import type { MatchCard } from "@/src/types/domain";

const DEFAULT_TBA_BASE_URL = "https://www.thebluealliance.com/api/v3";
const FETCH_TIMEOUT_MS = 5500;

type FetchTbaOptions = {
  eventKey: string;
  teamNumber: number;
  leadMinutes: number;
};

export class TbaUnavailableError extends Error {}

function toTeamNumbers(teamKeys: unknown): number[] {
  if (!Array.isArray(teamKeys)) {
    return [];
  }
  return teamKeys
    .map((value) => (typeof value === "string" ? teamKeyToNumber(value) : null))
    .filter((value): value is number => value !== null);
}

function parseMatch(raw: unknown, opts: FetchTbaOptions): MatchCard | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const record = raw as Record<string, unknown>;
  const matchNumber = Number(record.match_number);
  if (!Number.isFinite(matchNumber)) {
    return null;
  }

  const alliances = (record.alliances as Record<string, unknown> | undefined) ?? {};
  const red = (alliances.red as Record<string, unknown> | undefined) ?? {};
  const blue = (alliances.blue as Record<string, unknown> | undefined) ?? {};

  const redTeams = toTeamNumbers(red.team_keys);
  const blueTeams = toTeamNumbers(blue.team_keys);

  if (inferAllianceColor(opts.teamNumber, redTeams, blueTeams) === "unknown") {
    return null;
  }

  const expectedStartTimeRaw = record.predicted_time ?? record.scheduled_time ?? record.time ?? null;
  const completed = Number(record.actual_time ?? 0) > 0;

  return buildMatchCard({
    matchKey: String(record.key ?? `${opts.eventKey}_${String(record.comp_level ?? "qm")}${Math.trunc(matchNumber)}`),
    source: "TBA",
    compLevelRaw: String(record.comp_level ?? "qm"),
    matchNumber: Math.trunc(matchNumber),
    teamNumber: opts.teamNumber,
    redTeams,
    blueTeams,
    expectedStartTimeRaw,
    queueTimeRaw: null,
    onDeckTimeRaw: null,
    onFieldTimeRaw: null,
    completed,
    leadMinutes: opts.leadMinutes
  });
}

export async function fetchTbaMatches(opts: FetchTbaOptions): Promise<MatchCard[]> {
  const apiKey = process.env.TBA_API_KEY;
  if (!apiKey) {
    throw new TbaUnavailableError("TBA_API_KEY is not configured");
  }

  const baseUrl = process.env.TBA_BASE_URL ?? DEFAULT_TBA_BASE_URL;
  const endpoint = `${baseUrl.replace(/\/$/, "")}/team/frc${opts.teamNumber}/event/${encodeURIComponent(opts.eventKey)}/matches/simple`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(endpoint, {
      headers: {
        "X-TBA-Auth-Key": apiKey,
        Accept: "application/json"
      },
      signal: controller.signal,
      cache: "no-store"
    });
  } catch (error) {
    throw new TbaUnavailableError(`TBA request failed: ${(error as Error).message}`);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new TbaUnavailableError(`TBA responded with ${response.status}`);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    throw new TbaUnavailableError(`TBA JSON parse failed: ${(error as Error).message}`);
  }

  if (!Array.isArray(payload)) {
    throw new TbaUnavailableError("TBA payload is not an array");
  }

  const matches = payload
    .map((match) => parseMatch(match, opts))
    .filter((match): match is MatchCard => match !== null);

  return sortMatches(matches);
}
