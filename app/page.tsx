"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

import { MatchCardView } from "@/app/components/MatchCard";
import { getPitStage, isNowQueueing, queueCountdown } from "@/src/matches/pitFlow";
import { getMatchesSnapshot, getSettings, listRunsForEvent, saveMatchesSnapshot } from "@/src/storage/localDb";
import {
  buildRunSummaryMap,
  emptyRunSummary,
  pickNextFocusMatch,
  summaryProgressLabel,
  summaryStatusLabel,
  summaryStatusTone,
  type MatchRunSummary
} from "@/src/runs/summary";
import type { AppSettings, MatchCard, MatchesPayload } from "@/src/types/domain";

type IntegrationStatus = {
  nexus: { configured: boolean; baseUrl: string };
  tba: { configured: boolean; baseUrl: string };
  fallbackEnabled: boolean;
};

type RunSummaryByMatch = Record<string, MatchRunSummary>;
type NotificationState = NotificationPermission | "unsupported" | null;

type FocusBoardCopy = {
  eyebrow: string;
  title: string;
  guidance: string;
  tone: "upcoming" | "queue" | "field";
};

function formatTime(iso: string | null): string {
  if (!iso) {
    return "TBD";
  }
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function statusClass(status: MatchCard["status"]): "upcoming" | "queue" | "deck" | "field" | "done" {
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

function matchLabel(match: MatchCard): string {
  return `${match.compLevel.toUpperCase()} ${match.matchNumber}`;
}

function checklistActionText(match: MatchCard, summary: MatchRunSummary): string {
  if (!summary.hasRun) {
    return getPitStage(match) === "PREP_NEXT" || getPitStage(match) === "LATER" ? "Start cold checks" : "Start preflight";
  }
  if (summary.runState === "READY") {
    return "Review ready match";
  }
  if (summary.openActionCards > 0) {
    return "Resume and close delays";
  }
  return "Resume checklist";
}

function buildFocusBoardCopy(match: MatchCard, summary: MatchRunSummary): FocusBoardCopy {
  const label = matchLabel(match);
  const stage = getPitStage(match);
  const delayedText = summary.openActionCards === 1 ? "1 delayed check" : `${summary.openActionCards} delayed checks`;

  if (summary.runState === "READY") {
    if (stage === "QUEUE_NOW" || stage === "QUEUE_SOON") {
      return {
        eyebrow: "Queue window",
        title: `${label} is ready`,
        guidance: "Checklist is clear. Keep the robot on this match and move toward queue.",
        tone: "field"
      };
    }
    return {
      eyebrow: "Ready",
      title: `${label} is already ready`,
      guidance: "Nothing is waiting in the checklist. Review only if the robot changed after the last run.",
      tone: "field"
    };
  }

  if (summary.openActionCards > 0) {
    return {
      eyebrow: stage === "QUEUE_NOW" ? "Do now" : "Delegated work",
      title: `${label} is waiting on ${delayedText}`,
      guidance: "Keep the checklist moving, but this match cannot be marked ready until delayed work is marked pass.",
      tone: "queue"
    };
  }

  if (!summary.hasRun) {
    if (stage === "QUEUE_NOW") {
      return {
        eyebrow: "Do now",
        title: `Start ${label} preflight now`,
        guidance: "Queue is already open. Work this match first instead of looking ahead.",
        tone: "queue"
      };
    }
    if (stage === "QUEUE_SOON") {
      return {
        eyebrow: "Queue soon",
        title: `Finish ${label} before queue`,
        guidance: "Use the remaining minutes for cold checks so queue is only hot checks and fast fixes.",
        tone: "queue"
      };
    }
    return {
      eyebrow: "Prep next",
      title: `Prep ${label} next`,
      guidance: "This is the next match that still needs work. Start cold checks now while the pit is quiet.",
      tone: "upcoming"
    };
  }

  return {
    eyebrow: stage === "QUEUE_NOW" ? "Do now" : "In progress",
    title: `Continue ${label}`,
    guidance: `${summary.passedCount}/${summary.totalSteps} checks are already passed. Keep advancing and delay anything someone else is fixing.`,
    tone: stage === "QUEUE_NOW" || stage === "QUEUE_SOON" ? "queue" : "upcoming"
  };
}

export default function DashboardPage(): React.JSX.Element {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [matches, setMatches] = useState<MatchCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usingSnapshot, setUsingSnapshot] = useState(false);
  const [source, setSource] = useState<"NEXUS" | "TBA" | "MOCK" | null>(null);
  const [fallback, setFallback] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [integrationStatus, setIntegrationStatus] = useState<IntegrationStatus | null>(null);
  const [runSummaryByMatch, setRunSummaryByMatch] = useState<RunSummaryByMatch>({});
  const [notificationPermission, setNotificationPermission] = useState<NotificationState>(null);
  const announced = useRef<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    const current = await getSettings();
    setSettings(current);

    if (!current.eventKey) {
      setMatches([]);
      setRunSummaryByMatch({});
      setLoading(false);
      return;
    }

    const runStatePromise = listRunsForEvent(current.eventKey)
      .then((runs) => buildRunSummaryMap(runs))
      .catch(() => ({}));

    try {
      const modeParam = current.dataMode === "mock" ? "&mode=mock" : "";
      const res = await fetch(
        `/api/matches?team=${encodeURIComponent(String(current.teamNumber))}&event=${encodeURIComponent(current.eventKey)}&leadMinutes=${encodeURIComponent(String(current.queueLeadMinutes))}${modeParam}`,
        { cache: "no-store" }
      );

      if (!res.ok) {
        throw new Error(`API request failed with ${res.status}`);
      }

      const payload = (await res.json()) as MatchesPayload;
      setMatches(payload.matches ?? []);
      setSource(payload.source);
      setFallback(Boolean(payload.isFallback));
      setLastUpdated(payload.lastUpdatedIso ?? new Date().toISOString());
      setUsingSnapshot(false);
      await saveMatchesSnapshot(current.eventKey, current.teamNumber, payload);
    } catch (fetchError) {
      const snapshot = await getMatchesSnapshot(current.eventKey, current.teamNumber);
      if (snapshot) {
        setMatches(snapshot.matches);
        setSource(snapshot.source);
        setFallback(Boolean(snapshot.isFallback));
        setLastUpdated(snapshot.lastUpdatedIso ?? null);
        setUsingSnapshot(true);
        setError(`Live fetch failed. Showing last saved matches: ${(fetchError as Error).message}`);
      } else {
        setError(`Unable to load match data: ${(fetchError as Error).message}`);
      }
    } finally {
      setRunSummaryByMatch(await runStatePromise);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();

    const statusInterval = setInterval(() => {
      void refresh();
    }, 60_000);

    return () => clearInterval(statusInterval);
  }, [refresh]);

  useEffect(() => {
    if (typeof Notification === "undefined") {
      setNotificationPermission("unsupported");
      return;
    }
    setNotificationPermission(Notification.permission);
  }, []);

  useEffect(() => {
    fetch("/api/integrations/status", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`Status API failed: ${res.status}`);
        }
        return (await res.json()) as IntegrationStatus;
      })
      .then((status) => setIntegrationStatus(status))
      .catch(() => {
        // non-blocking
      });
  }, []);

  useEffect(() => {
    if (notificationPermission !== "granted") {
      return;
    }
    for (const match of matches) {
      if (!isNowQueueing(match)) {
        continue;
      }
      if (announced.current.has(match.matchKey)) {
        continue;
      }
      announced.current.add(match.matchKey);
      new Notification(`9470 Queue Alert: ${matchLabel(match)}`, {
        body: queueCountdown(match.queueTimeIso)
      });
    }
  }, [matches, notificationPermission]);

  const nowQueueingMatches = useMemo(() => matches.filter(isNowQueueing), [matches]);
  const upcomingMatches = useMemo(() => matches.filter((match) => !isNowQueueing(match)), [matches]);
  const focusMatch = useMemo(
    () => pickNextFocusMatch(nowQueueingMatches, upcomingMatches, runSummaryByMatch),
    [nowQueueingMatches, upcomingMatches, runSummaryByMatch]
  );
  const focusSummary = focusMatch ? (runSummaryByMatch[focusMatch.matchKey] ?? emptyRunSummary(focusMatch.matchKey)) : null;
  const focusCopy = focusMatch && focusSummary ? buildFocusBoardCopy(focusMatch, focusSummary) : null;
  const additionalQueueingMatches = useMemo(
    () => nowQueueingMatches.filter((match) => match.matchKey !== focusMatch?.matchKey),
    [focusMatch?.matchKey, nowQueueingMatches]
  );
  const remainingUpcomingMatches = useMemo(
    () => upcomingMatches.filter((match) => match.matchKey !== focusMatch?.matchKey),
    [focusMatch?.matchKey, upcomingMatches]
  );

  const requestNotifications = async (): Promise<void> => {
    if (typeof Notification === "undefined") {
      setNotificationPermission("unsupported");
      return;
    }
    const result = await Notification.requestPermission();
    setNotificationPermission(result);
  };

  const liveModeConfigWarning =
    settings?.dataMode === "live" &&
    integrationStatus &&
    (!integrationStatus.nexus.configured || !integrationStatus.tba.configured);

  return (
    <div className="col" style={{ gap: 14 }}>
      <section className="card dashboard-toolbar">
        <div className="dashboard-toolbar-row">
          <div className="dashboard-toolbar-main">
            <div className="label">Pit Board</div>
            <div className="dashboard-event-row">
              <div className="dashboard-event-name">{settings?.eventKey || "Not configured"}</div>
              {source ? (
                <span className={`pill ${source === "MOCK" ? "upcoming" : fallback ? "queue" : "field"}`}>
                  {source === "MOCK" ? "Mock feed" : fallback ? `${source} fallback` : source}
                </span>
              ) : null}
              {usingSnapshot ? <span className="pill queue">Offline snapshot</span> : null}
            </div>
            <div className="dashboard-toolbar-meta">
              <span>Team {settings?.teamNumber ?? 9470}</span>
              <span>Queue lead {settings?.queueLeadMinutes ?? 20}m</span>
              <span>{lastUpdated ? `Updated ${new Date(lastUpdated).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "Not synced yet"}</span>
            </div>
          </div>
          <div className="dashboard-toolbar-actions">
            <button className="button secondary" type="button" onClick={() => void requestNotifications()}>
              {notificationPermission === "granted" ? "Alerts on" : "Enable alerts"}
            </button>
            <button className="button secondary" onClick={() => void refresh()} type="button">
              Refresh
            </button>
            <Link className="button secondary" href="/settings">
              Settings
            </Link>
          </div>
        </div>

        {!settings?.eventKey ? (
          <div className="inline-msg">
            Configure event key in <Link href="/settings">Settings</Link> to load upcoming matches.
          </div>
        ) : null}

        {settings?.dataMode === "mock" ? (
          <div className="label">Mock mode is active. Use it to test dashboard timing, preflight flow, and delayed checks before the event starts.</div>
        ) : null}

        {notificationPermission === "denied" ? (
          <div className="label">Notifications are blocked by the browser. The board still updates in-app.</div>
        ) : null}
        {notificationPermission === "unsupported" ? (
          <div className="label">Browser notifications are not supported on this device.</div>
        ) : null}

        {liveModeConfigWarning ? (
          <div className="inline-msg warn">Live mode is selected, but one or more API keys are missing. Mock mode will be safer until credentials are complete.</div>
        ) : null}
        {error ? <div className="inline-msg warn">{error}</div> : null}
      </section>

      {loading && !focusMatch ? <section className="card">Loading matches...</section> : null}

      {focusMatch && focusSummary && focusCopy ? (
        <section className={`card ready-board tone-${focusCopy.tone}`}>
          <div className="ready-board-top">
            <div className="col" style={{ gap: 6 }}>
              <div className="ready-board-kicker">{focusCopy.eyebrow}</div>
              <h2 style={{ margin: 0 }}>{focusCopy.title}</h2>
              <div className="ready-board-guidance">{focusCopy.guidance}</div>
              <div className="ready-board-inline">
                <span className={`pill ${statusClass(focusMatch.status)}`}>{focusMatch.status.replaceAll("_", " ")}</span>
                <span className={`pill ${summaryStatusTone(focusSummary)}`}>Checklist {summaryStatusLabel(focusSummary)}</span>
              </div>
            </div>
          </div>

          <div className="ready-board-grid">
            <div className="ready-board-block">
              <div className="label">Queue</div>
              <div className="value">{queueCountdown(focusMatch.queueTimeIso)}</div>
              <div className="label">At {formatTime(focusMatch.queueTimeIso)}</div>
            </div>
            <div className="ready-board-block">
              <div className="label">Field</div>
              <div className="value">{formatTime(focusMatch.expectedStartTimeIso)}</div>
              <div className="label">On deck {formatTime(focusMatch.onDeckTimeIso)}</div>
            </div>
            <div className="ready-board-block">
              <div className="label">Checklist</div>
              <div className="value">{summaryProgressLabel(focusSummary)}</div>
              <div className={`label alliance ${focusMatch.allianceColor}`}>{focusMatch.allianceColor.toUpperCase()} alliance</div>
            </div>
          </div>

          <div className="team-rows">
            <div className="team-row">
              <span className="team-side">ALLY</span>
              <span className={`team-values alliance ${focusMatch.allianceColor}`}>{focusMatch.allianceTeams.join(" • ")}</span>
            </div>
            <div className="team-row">
              <span className="team-side">OPP</span>
              <span className={`team-values alliance ${focusMatch.allianceColor === "red" ? "blue" : focusMatch.allianceColor === "blue" ? "red" : "unknown"}`}>
                {focusMatch.opponentTeams.join(" • ")}
              </span>
            </div>
          </div>

          <div className="ready-board-actions">
            <Link className="button" href={`/match/${encodeURIComponent(focusMatch.matchKey)}/preflight`}>
              {checklistActionText(focusMatch, focusSummary)}
            </Link>
          </div>
        </section>
      ) : null}

      {!loading && settings?.eventKey && !focusMatch ? (
        <section className="card">No upcoming matches right now.</section>
      ) : null}

      {additionalQueueingMatches.length > 0 ? (
        <section className="col" style={{ gap: 10 }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2 style={{ margin: 0 }}>Also Queueing</h2>
            <span className="label">{additionalQueueingMatches.length} more</span>
          </div>
          {additionalQueueingMatches.map((match) => (
            <MatchCardView
              key={`queueing-${match.matchKey}`}
              match={match}
              summary={runSummaryByMatch[match.matchKey] ?? emptyRunSummary(match.matchKey)}
            />
          ))}
        </section>
      ) : null}

      <section className="col" style={{ gap: 10 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 style={{ margin: 0 }}>Next Up</h2>
          {!loading && remainingUpcomingMatches.length ? <span className="label">{remainingUpcomingMatches.length} queued later</span> : null}
        </div>
        {loading ? <div className="card">Loading matches...</div> : null}
        {!loading && !remainingUpcomingMatches.length ? <div className="card">No additional matches to prep right now.</div> : null}
        {remainingUpcomingMatches.map((match) => (
          <MatchCardView key={match.matchKey} match={match} summary={runSummaryByMatch[match.matchKey] ?? emptyRunSummary(match.matchKey)} />
        ))}
      </section>
    </div>
  );
}
