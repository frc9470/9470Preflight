import { NextRequest, NextResponse } from "next/server";

import { buildMockMatches } from "@/src/integrations/mock";
import { NexusInvalidPayloadError, NexusUnavailableError, fetchNexusMatches } from "@/src/integrations/nexus";
import { TbaUnavailableError, fetchTbaMatches } from "@/src/integrations/tba";
import { sortMatches } from "@/src/integrations/normalize";
import type { MatchCard } from "@/src/types/domain";

type IntegrationSource = "NEXUS" | "TBA" | "MOCK";

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

export async function GET(request: NextRequest): Promise<NextResponse> {
  const teamNumber = parsePositiveInt(request.nextUrl.searchParams.get("team"));
  const eventKey = request.nextUrl.searchParams.get("event")?.trim() ?? "";
  const leadMinutes = parsePositiveInt(request.nextUrl.searchParams.get("leadMinutes")) ?? 20;
  const mode = request.nextUrl.searchParams.get("mode")?.trim().toLowerCase();
  const useMock = mode === "mock" || request.nextUrl.searchParams.get("mock") === "1";

  if (!teamNumber || !eventKey) {
    return NextResponse.json(
      {
        error: "Missing or invalid query parameters. Required: team, event. Optional: leadMinutes."
      },
      { status: 400 }
    );
  }

  const opts = { teamNumber, eventKey, leadMinutes };

  if (useMock) {
    const mockMatches = buildMockMatches(opts);
    return NextResponse.json({
      matches: stamp(mockMatches, "MOCK", false),
      source: "MOCK",
      isFallback: false,
      lastUpdatedIso: new Date().toISOString()
    });
  }

  try {
    const nexusMatches = await fetchNexusMatches(opts);
    return NextResponse.json({
      matches: stamp(sortMatches(nexusMatches), "NEXUS", false),
      source: "NEXUS",
      isFallback: false,
      lastUpdatedIso: new Date().toISOString()
    });
  } catch (nexusError) {
    const isNexusKnownFailure =
      nexusError instanceof NexusUnavailableError || nexusError instanceof NexusInvalidPayloadError;

    if (!isNexusKnownFailure) {
      return NextResponse.json(
        {
          error: "Unexpected Nexus integration error",
          details: (nexusError as Error).message
        },
        { status: 500 }
      );
    }

    try {
      const tbaMatches = await fetchTbaMatches(opts);
      return NextResponse.json({
        matches: stamp(sortMatches(tbaMatches), "TBA", true),
        source: "TBA",
        isFallback: true,
        lastUpdatedIso: new Date().toISOString(),
        fallbackReason: (nexusError as Error).message
      });
    } catch (tbaError) {
      const isTbaKnownFailure = tbaError instanceof TbaUnavailableError;
      return NextResponse.json(
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
