import { PRE_FLIGHT_STEP_COUNT } from "../checklist/preflight9470";
import type { MatchCard, PreflightRun, PreflightRunState } from "../types/domain";

export type MatchRunSummary = {
  matchKey: string;
  hasRun: boolean;
  runState?: PreflightRunState;
  passedCount: number;
  openActionCards: number;
  totalSteps: number;
  startedAtIso?: string;
};

function runSummaryFromRun(run: PreflightRun): MatchRunSummary {
  return {
    matchKey: run.matchKey,
    hasRun: true,
    runState: run.state,
    passedCount: run.responses.filter((response) => response.passed).length,
    openActionCards: (run.actionCards ?? []).filter((card) => card.status === "OPEN").length,
    totalSteps: PRE_FLIGHT_STEP_COUNT,
    startedAtIso: run.startedAtIso
  };
}

export function buildRunSummaryMap(runs: PreflightRun[]): Record<string, MatchRunSummary> {
  const summaries: Record<string, MatchRunSummary> = {};

  for (const run of runs) {
    const existing = summaries[run.matchKey];
    if (existing && existing.startedAtIso && existing.startedAtIso >= run.startedAtIso) {
      continue;
    }
    summaries[run.matchKey] = runSummaryFromRun(run);
  }

  return summaries;
}

export function emptyRunSummary(matchKey: string): MatchRunSummary {
  return {
    matchKey,
    hasRun: false,
    passedCount: 0,
    openActionCards: 0,
    totalSteps: PRE_FLIGHT_STEP_COUNT
  };
}

export function isSummaryReady(summary: MatchRunSummary | undefined): boolean {
  return summary?.runState === "READY";
}

export function summaryStatusLabel(summary: MatchRunSummary): string {
  if (!summary.hasRun) {
    return "Not started";
  }
  if (summary.runState === "READY") {
    return "Ready";
  }
  if (summary.openActionCards > 0) {
    return summary.openActionCards === 1 ? "1 delayed" : `${summary.openActionCards} delayed`;
  }
  if (summary.runState === "BLOCKED") {
    return "Needs attention";
  }
  return "In checklist";
}

export function summaryStatusTone(summary: MatchRunSummary): "upcoming" | "queue" | "field" {
  if (summary.runState === "READY") {
    return "field";
  }
  if (summary.openActionCards > 0 || summary.runState === "BLOCKED") {
    return "queue";
  }
  return "upcoming";
}

export function summaryProgressLabel(summary: MatchRunSummary): string {
  const parts = [`${summary.passedCount}/${summary.totalSteps} pass`];
  if (summary.openActionCards > 0) {
    parts.push(summary.openActionCards === 1 ? "1 delayed" : `${summary.openActionCards} delayed`);
  }
  return parts.join(" • ");
}

export function pickNextFocusMatch(
  queueingMatches: MatchCard[],
  upcomingMatches: MatchCard[],
  summaries: Record<string, MatchRunSummary>
): MatchCard | null {
  const actionableQueueing = queueingMatches.find((match) => !isSummaryReady(summaries[match.matchKey]));
  if (actionableQueueing) {
    return actionableQueueing;
  }

  const actionableUpcoming = upcomingMatches.find((match) => !isSummaryReady(summaries[match.matchKey]));
  if (actionableUpcoming) {
    return actionableUpcoming;
  }

  return queueingMatches[0] ?? upcomingMatches[0] ?? null;
}
