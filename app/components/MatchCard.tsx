"use client";

import Link from "next/link";

import type { MatchCard, PreflightRunState } from "@/src/types/domain";

function formatTime(iso: string | null): string {
  if (!iso) {
    return "TBD";
  }
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function statusClass(status: MatchCard["status"]): string {
  if (status === "QUEUE") {
    return "queue";
  }
  if (status === "ON_DECK") {
    return "deck";
  }
  if (status === "ON_FIELD_SOON") {
    return "field";
  }
  if (status === "COMPLETED") {
    return "done";
  }
  return "upcoming";
}

function opposingColor(color: MatchCard["allianceColor"]): "red" | "blue" | "unknown" {
  if (color === "red") {
    return "blue";
  }
  if (color === "blue") {
    return "red";
  }
  return "unknown";
}

function checklistStateLabel(runState: PreflightRunState | undefined): string {
  if (!runState) {
    return "Not started";
  }
  if (runState === "IN_PROGRESS") {
    return "In progress";
  }
  return runState.replaceAll("_", " ");
}

function checklistStatePill(runState: PreflightRunState | undefined): "upcoming" | "queue" | "field" {
  if (!runState) {
    return "upcoming";
  }
  if (runState === "READY") {
    return "field";
  }
  if (runState === "BLOCKED") {
    return "queue";
  }
  return "upcoming";
}

export function MatchCardView(
  { match, runState }: { match: MatchCard; runState?: PreflightRunState }
): React.JSX.Element {
  const allianceLabel = match.allianceColor.toUpperCase();
  const allianceTeams = match.allianceTeams.length ? match.allianceTeams.join(" • ") : "Unknown";
  const opponentTeams = match.opponentTeams.length ? match.opponentTeams.join(" • ") : "Unknown";
  const opponentColor = opposingColor(match.allianceColor);
  const checklistText = checklistStateLabel(runState);
  const checklistPillClass = checklistStatePill(runState);
  const checklistActionText = runState ? (runState === "READY" ? "Review checklist" : "Resume checklist") : "Start checklist";

  return (
    <Link className="card match-card" href={`/match/${encodeURIComponent(match.matchKey)}/preflight`}>
      <div className="match-card-top">
        <div className="match-main">
          <div className="match-name">
            {match.compLevel.toUpperCase()} {match.matchNumber}
          </div>
          <div className="match-meta">
            <span className={`alliance ${match.allianceColor}`}>{allianceLabel}</span>
            <span>Queue {formatTime(match.queueTimeIso)}</span>
            <span>ETA {formatTime(match.expectedStartTimeIso)}</span>
          </div>
        </div>
        <span className={`pill ${statusClass(match.status)}`}>{match.status.replaceAll("_", " ")}</span>
      </div>

      <div className="team-rows">
        <div className="team-row">
          <span className="team-side">ALLY</span>
          <span className={`team-values alliance ${match.allianceColor}`}>{allianceTeams}</span>
        </div>
        <div className="team-row">
          <span className="team-side">OPP</span>
          <span className={`team-values alliance ${opponentColor}`}>{opponentTeams}</span>
        </div>
      </div>

      <div className="match-footer">
        <span className={`pill ${checklistPillClass}`}>Checklist {checklistText}</span>
        <span className="label">{checklistActionText}</span>
      </div>
    </Link>
  );
}
