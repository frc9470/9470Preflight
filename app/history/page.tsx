"use client";

import { useEffect, useState } from "react";

import { getSettings, listRunsForEvent } from "@/src/storage/localDb";
import type { PreflightRun } from "@/src/types/domain";

export default function HistoryPage(): React.JSX.Element {
  const [eventKey, setEventKey] = useState<string>("");
  const [runs, setRuns] = useState<PreflightRun[]>([]);

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

  return (
    <div className="col" style={{ gap: 12 }}>
      <h1 style={{ margin: 0 }}>Event History</h1>
      <div className="label">Current event: {eventKey || "Not configured"}</div>

      {!runs.length ? (
        <div className="card">No preflight runs stored for this event yet.</div>
      ) : (
        <div className="grid">
          {runs.map((run) => (
            <article className="card col" key={run.runId}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <div style={{ fontWeight: 700 }}>{run.matchKey}</div>
                <span className={`pill ${run.state === "READY" ? "field" : "queue"}`}>{run.state}</span>
              </div>
              <div className="label">Started: {new Date(run.startedAtIso).toLocaleString()}</div>
              <div className="label">
                Completed: {run.completedAtIso ? new Date(run.completedAtIso).toLocaleString() : "Not completed"}
              </div>
              <div className="label">Responses: {run.responses.length}</div>
              <div className="label">
                Open action cards: {(run.actionCards ?? []).filter((card) => card.status === "OPEN").length}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
