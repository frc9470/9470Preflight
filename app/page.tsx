"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

import { MatchCardView } from "@/app/components/MatchCard";
import { getMatchesSnapshot, getSettings, saveMatchesSnapshot } from "@/src/storage/localDb";
import type { AppSettings, MatchCard, MatchesPayload } from "@/src/types/domain";

type IntegrationStatus = {
  nexus: { configured: boolean; baseUrl: string };
  tba: { configured: boolean; baseUrl: string };
  fallbackEnabled: boolean;
};

function queueCountdown(iso: string | null): string {
  if (!iso) {
    return "Queue time unavailable";
  }
  const ms = new Date(iso).getTime() - Date.now();
  const minutes = Math.round(ms / 60000);
  if (minutes > 0) {
    return `${minutes} min to queue`;
  }
  if (minutes === 0) {
    return "Queue now";
  }
  return `${Math.abs(minutes)} min past queue`;
}

function isQueueSoon(match: MatchCard): boolean {
  if (!match.queueTimeIso) {
    return false;
  }
  const delta = new Date(match.queueTimeIso).getTime() - Date.now();
  return delta <= 15 * 60 * 1000 && delta >= -5 * 60 * 1000;
}

function isNowQueueing(match: MatchCard): boolean {
  if (match.status === "QUEUE" || match.status === "ON_DECK" || match.status === "ON_FIELD_SOON") {
    return true;
  }
  return isQueueSoon(match);
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
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | "unsupported">(
    typeof Notification === "undefined" ? "unsupported" : Notification.permission
  );
  const announced = useRef<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    const current = await getSettings();
    setSettings(current);

    if (!current.eventKey) {
      setMatches([]);
      setLoading(false);
      return;
    }

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
      new Notification(`9470 Queue Alert: ${match.compLevel.toUpperCase()} ${match.matchNumber}`, {
        body: queueCountdown(match.queueTimeIso)
      });
    }
  }, [matches, notificationPermission]);

  const nowQueueingMatches = useMemo(() => matches.filter(isNowQueueing), [matches]);
  const upcomingMatches = useMemo(() => matches.filter((match) => !isNowQueueing(match)), [matches]);

  const requestNotifications = async (): Promise<void> => {
    if (typeof Notification === "undefined") {
      setNotificationPermission("unsupported");
      return;
    }
    const result = await Notification.requestPermission();
    setNotificationPermission(result);
  };

  return (
    <div className="col" style={{ gap: 14 }}>
      <section className="card col">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div>
            <div className="label">Active Event</div>
            <div className="value" style={{ fontSize: "1.2rem", fontWeight: 700 }}>
              {settings?.eventKey || "Not configured"}
            </div>
          </div>
          <button className="button secondary" onClick={() => void refresh()} type="button">
            Refresh
          </button>
        </div>

        <div className="grid two">
          <div>
            <div className="label">Team</div>
            <div className="value">{settings?.teamNumber ?? 9470}</div>
          </div>
          <div>
            <div className="label">Queue Lead</div>
            <div className="value">{settings?.queueLeadMinutes ?? 20} min</div>
          </div>
          <div>
            <div className="label">Data Mode</div>
            <div className="value">{settings?.dataMode === "mock" ? "Mock" : "Live"}</div>
          </div>
        </div>

        {!settings?.eventKey ? (
          <div className="inline-msg">
            Configure event key in <Link href="/settings">Settings</Link> to load upcoming matches.
          </div>
        ) : null}

        <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
          <div className="label">
            Source: {source ?? "-"}
            {fallback ? " (Fallback)" : ""}
            {usingSnapshot ? " • Offline Snapshot" : ""}
          </div>
          <div className="label">Updated: {lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : "-"}</div>
        </div>

        {integrationStatus ? (
          <div className="label">
            Nexus key: {integrationStatus.nexus.configured ? "set" : "missing"} • TBA key: {integrationStatus.tba.configured ? "set" : "missing"}
          </div>
        ) : null}
        {settings?.dataMode === "mock" ? (
          <div className="inline-msg">
            Mock mode is active. Matches are generated locally for testing pit workflows.
          </div>
        ) : null}
      </section>

      <section className="col" style={{ gap: 10 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 style={{ margin: 0 }}>Now Queueing</h2>
          <button className="button secondary" type="button" onClick={() => void requestNotifications()}>
            {notificationPermission === "granted" ? "Alerts On" : "Enable Alerts"}
          </button>
        </div>

        {notificationPermission === "denied" ? (
          <div className="label">Notifications blocked by browser. In-app warnings still shown below.</div>
        ) : null}
        {notificationPermission === "unsupported" ? (
          <div className="label">Browser notifications are not supported on this device.</div>
        ) : null}

        {loading ? (
          <div className="card">Loading matches...</div>
        ) : nowQueueingMatches.length ? (
          nowQueueingMatches.map((match) => <MatchCardView key={`queueing-${match.matchKey}`} match={match} />)
        ) : (
          <div className="card">No matches currently queueing.</div>
        )}
      </section>

      <section className="col" style={{ gap: 10 }}>
        <h2 style={{ margin: 0 }}>Upcoming Matches</h2>
        {error ? <div className="inline-msg warn">{error}</div> : null}
        {loading ? <div className="card">Loading matches...</div> : null}
        {!loading && !upcomingMatches.length ? <div className="card">No additional upcoming matches right now.</div> : null}
        {upcomingMatches.map((match) => (
          <MatchCardView key={match.matchKey} match={match} />
        ))}
      </section>
    </div>
  );
}
