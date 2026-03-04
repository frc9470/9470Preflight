"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { getSettings, listRunsForEvent } from "@/src/storage/localDb";
import { PRE_FLIGHT_STEP_COUNT } from "@/src/checklist/preflight9470";
import type { PreflightRun } from "@/src/types/domain";

type RunFilter = "ALL" | "READY" | "BLOCKED" | "IN_PROGRESS";

function countOpenCards(run: PreflightRun): number {
  return (run.actionCards ?? []).filter((card) => card.status === "OPEN").length;
}

function runStatePill(state: PreflightRun["state"]): "field" | "queue" | "upcoming" {
  if (state === "READY") {
    return "field";
  }
  if (state === "BLOCKED") {
    return "queue";
  }
  return "upcoming";
}

export default function HistoryPage(): React.JSX.Element {
  const [eventKey, setEventKey] = useState<string>("");
  const [runs, setRuns] = useState<PreflightRun[]>([]);
  const [filter, setFilter] = useState<RunFilter>("ALL");

  useEffect(() => {
    const load = async (): Promise<void> => {
      const settings = await getSettings();
      setEventKey(settings.eventKey);
      if (!settings.eventKey) {
        setRuns([]);
        return;
      }
      const eventRuns = await listRunsForEvent(settings.eventKey);
      setRuns(eventRuns);
    };

    void load();
  }, []);

  const summary = useMemo(() => {
    const ready = runs.filter((run) => run.state === "READY").length;
    const blocked = runs.filter((run) => run.state === "BLOCKED").length;
    const inProgress = runs.filter((run) => run.state === "IN_PROGRESS").length;
    const openCards = runs.reduce((sum, run) => sum + countOpenCards(run), 0);
    return { total: runs.length, ready, blocked, inProgress, openCards };
  }, [runs]);

  const filteredRuns = useMemo(() => {
    if (filter === "ALL") {
      return runs;
    }
    return runs.filter((run) => run.state === filter);
  }, [filter, runs]);

  return (
    <div className="col" style={{ gap: 12 }}>
      <h1 style={{ margin: 0 }}>Event History</h1>
      <div className="label">Current event: {eventKey || "Not configured"}</div>

      {runs.length ? (
        <>
          <section className="card">
            <div className="progress-meta compact">
              <span className="label">Runs {summary.total}</span>
              <span className="label">Ready {summary.ready}</span>
              <span className="label">Blocked {summary.blocked}</span>
              <span className="label">In Progress {summary.inProgress}</span>
              <span className="label">Open Delays {summary.openCards}</span>
            </div>
          </section>

          <section className="row" style={{ flexWrap: "wrap", gap: 8 }}>
            {(["ALL", "READY", "BLOCKED", "IN_PROGRESS"] as const).map((state) => (
              <button
                key={state}
                className={`button secondary small ${filter === state ? "active" : ""}`}
                type="button"
                onClick={() => setFilter(state)}
              >
                {state === "IN_PROGRESS" ? "IN PROGRESS" : state}
              </button>
            ))}
          </section>
        </>
      ) : null}

      {!runs.length ? (
        <div className="card">No preflight runs stored for this event yet.</div>
      ) : (
        <div className="grid">
          {!filteredRuns.length ? <div className="card">No runs match the selected filter.</div> : null}
          {filteredRuns.map((run) => {
            const passed = run.responses.filter((response) => response.passed).length;
            const openCards = countOpenCards(run);
            return (
            <article className="card col" key={run.runId}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <div style={{ fontWeight: 700 }}>{run.matchKey}</div>
                <span className={`pill ${runStatePill(run.state)}`}>{run.state}</span>
              </div>
              <div className="label">Started: {new Date(run.startedAtIso).toLocaleString()}</div>
              <div className="label">
                Completed: {run.completedAtIso ? new Date(run.completedAtIso).toLocaleString() : "Not completed"}
              </div>
              <div className="label">Passed: {passed} / {PRE_FLIGHT_STEP_COUNT}</div>
              <div className="label">Open delayed cards: {openCards}</div>
              <Link className="button secondary small" href={`/match/${encodeURIComponent(run.matchKey)}/preflight`}>
                Open Checklist
              </Link>
            </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
