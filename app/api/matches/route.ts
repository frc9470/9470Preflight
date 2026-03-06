import { NextRequest, NextResponse } from "next/server";

import { buildMockMatches } from "@/src/integrations/mock";
import { NexusInvalidPayloadError, NexusUnavailableError, fetchNexusMatches } from "@/src/integrations/nexus";
import { TbaUnavailableError, fetchTbaMatches } from "@/src/integrations/tba";
import { sortMatches } from "@/src/integrations/normalize";
import type { MatchCard } from "@/src/types/domain";

type IntegrationSource = "NEXUS" | "TBA" | "MOCK";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function parsePositiveInt(value: string | null): number | null {
  if (!value) {
    return null;
  }
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) {
    return null;
  }
  return Math.trunc(num);
}

function stamp(matches: MatchCard[], source: IntegrationSource, isFallback: boolean): MatchCard[] {
  const nowIso = new Date().toISOString();
  return matches.map((match) => ({
    ...match,
    source,
    isFallback,
    lastUpdatedIso: nowIso
  }));
}

function jsonNoStore(body: unknown, init?: ResponseInit): NextResponse {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "no-store, max-age=0");
  return response;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const teamNumber = parsePositiveInt(request.nextUrl.searchParams.get("team"));
  const eventKey = request.nextUrl.searchParams.get("event")?.trim() ?? "";
  const leadMinutes = parsePositiveInt(request.nextUrl.searchParams.get("leadMinutes")) ?? 20;
  const mode = request.nextUrl.searchParams.get("mode")?.trim().toLowerCase();
  const useMock = mode === "mock" || request.nextUrl.searchParams.get("mock") === "1";

  if (!teamNumber || !eventKey) {
    return jsonNoStore(
      {
        error: "Missing or invalid query parameters. Required: team, event. Optional: leadMinutes."
      },
      { status: 400 }
    );
  }

  const opts = { teamNumber, eventKey, leadMinutes };

  if (useMock) {
    const mockMatches = buildMockMatches(opts);
    return jsonNoStore({
      matches: stamp(mockMatches, "MOCK", false),
      source: "MOCK",
      isFallback: false,
      lastUpdatedIso: new Date().toISOString()
    });
  }

  try {
    const nexusMatches = await fetchNexusMatches(opts);
    return jsonNoStore({
      matches: stamp(sortMatches(nexusMatches), "NEXUS", false),
      source: "NEXUS",
      isFallback: false,
      lastUpdatedIso: new Date().toISOString()
    });
  } catch (nexusError) {
    const isNexusKnownFailure =
      nexusError instanceof NexusUnavailableError || nexusError instanceof NexusInvalidPayloadError;

    if (!isNexusKnownFailure) {
      return jsonNoStore(
        {
          error: "Unexpected Nexus integration error",
          details: (nexusError as Error).message
        },
        { status: 500 }
      );
    }

    try {
      const tbaMatches = await fetchTbaMatches(opts);
      return jsonNoStore({
        matches: stamp(sortMatches(tbaMatches), "TBA", true),
        source: "TBA",
        isFallback: true,
        lastUpdatedIso: new Date().toISOString(),
        fallbackReason: (nexusError as Error).message
      });
    } catch (tbaError) {
      const isTbaKnownFailure = tbaError instanceof TbaUnavailableError;
      return jsonNoStore(
        {
          error: "Both integrations failed",
          nexusError: (nexusError as Error).message,
          tbaError: isTbaKnownFailure ? (tbaError as Error).message : "Unexpected TBA error"
        },
        { status: 503 }
      );
    }
  }
}
