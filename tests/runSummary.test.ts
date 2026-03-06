import { describe, expect, test } from "vitest";

import {
  buildRunSummaryMap,
  emptyRunSummary,
  pickNextFocusMatch,
  summaryProgressLabel,
  summaryStatusLabel,
  summaryStatusTone
} from "../src/runs/summary";
import type { MatchCard, PreflightRun } from "../src/types/domain";

function makeRun(matchKey: string, patch: Partial<PreflightRun>): PreflightRun {
  return {
    runId: `${matchKey}:${patch.startedAtIso ?? "run"}`,
    eventKey: "CAHAL",
    matchKey,
    state: "IN_PROGRESS",
    startedAtIso: new Date().toISOString(),
    responses: [],
    actionCards: [],
    ...patch
  };
}

function makeMatch(matchKey: string, patch: Partial<MatchCard>): MatchCard {
  return {
    matchKey,
    source: "MOCK",
    compLevel: "qm",
    matchNumber: 1,
    allianceColor: "red",
    allianceTeams: [9470, 1, 2],
    opponentTeams: [3, 4, 5],
    expectedStartTimeIso: null,
    queueTimeIso: null,
    onDeckTimeIso: null,
    onFieldTimeIso: null,
    status: "UPCOMING",
    isFallback: false,
    lastUpdatedIso: new Date().toISOString(),
    ...patch
  };
}

describe("run summary helpers", () => {
  test("uses the latest run per match key", () => {
    const older = makeRun("CAHAL_qm2", {
      state: "BLOCKED",
      startedAtIso: "2026-03-01T10:00:00.000Z"
    });
    const newer = makeRun("CAHAL_qm2", {
      state: "READY",
      startedAtIso: "2026-03-01T12:00:00.000Z",
      responses: [{ stepId: "cold-1", passed: true, overridden: false, overrideReason: "", updatedAtIso: "2026-03-01T12:00:00.000Z" }]
    });

    const summaries = buildRunSummaryMap([older, newer]);

    expect(summaries["CAHAL_qm2"]?.runState).toBe("READY");
    expect(summaries["CAHAL_qm2"]?.passedCount).toBe(1);
  });

  test("prefers actionable queueing match for focus", () => {
    const queueing = makeMatch("CAHAL_qm1", { status: "QUEUE" });
    const upcoming = makeMatch("CAHAL_qm2", { status: "UPCOMING", matchNumber: 2 });

    const focus = pickNextFocusMatch(
      [queueing],
      [upcoming],
      {
        CAHAL_qm1: { ...emptyRunSummary("CAHAL_qm1"), hasRun: true, runState: "BLOCKED", passedCount: 10, openActionCards: 1, totalSteps: 38 },
        CAHAL_qm2: { ...emptyRunSummary("CAHAL_qm2"), hasRun: false }
      }
    );

    expect(focus?.matchKey).toBe("CAHAL_qm1");
  });

  test("skips ready queueing match when a later match still needs work", () => {
    const readyQueueing = makeMatch("CAHAL_qm1", { status: "QUEUE" });
    const pendingUpcoming = makeMatch("CAHAL_qm2", { status: "UPCOMING", matchNumber: 2 });

    const focus = pickNextFocusMatch(
      [readyQueueing],
      [pendingUpcoming],
      {
        CAHAL_qm1: { ...emptyRunSummary("CAHAL_qm1"), hasRun: true, runState: "READY", passedCount: 38, openActionCards: 0, totalSteps: 38 },
        CAHAL_qm2: { ...emptyRunSummary("CAHAL_qm2"), hasRun: false }
      }
    );

    expect(focus?.matchKey).toBe("CAHAL_qm2");
  });

  test("formats user-facing checklist status without exposing blocked terminology", () => {
    const delayed = {
      ...emptyRunSummary("CAHAL_qm3"),
      hasRun: true,
      runState: "BLOCKED" as const,
      passedCount: 22,
      openActionCards: 2
    };

    expect(summaryStatusLabel(delayed)).toBe("2 delayed");
    expect(summaryStatusTone(delayed)).toBe("queue");
    expect(summaryProgressLabel(delayed)).toBe("22/38 pass • 2 delayed");
  });
});
