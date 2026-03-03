"use client";

import { useEffect, useState } from "react";

import { clearAllRuns, getSettings, saveSettings } from "@/src/storage/localDb";
import type { AppSettings } from "@/src/types/domain";

export default function SettingsPage(): React.JSX.Element {
  const [form, setForm] = useState<AppSettings>({
    teamNumber: 9470,
    eventKey: "",
    queueLeadMinutes: 20,
    dataMode: "live"
  });
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSettings()
      .then((settings) => {
        setForm(settings);
      })
      .finally(() => setLoaded(true));
  }, []);

  const onSave = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setMessage(null);
    setError(null);
    setSaving(true);

    try {
      const dataMode = form.dataMode === "mock" ? "mock" : "live";
      const normalizedEventKey = form.eventKey.trim() || (dataMode === "mock" ? "practice" : "");

      const next: AppSettings = {
        teamNumber: Math.max(1, Math.trunc(Number(form.teamNumber) || 9470)),
        eventKey: normalizedEventKey,
        queueLeadMinutes: Math.max(1, Math.trunc(Number(form.queueLeadMinutes) || 20)),
        dataMode
      };

      if (!next.eventKey && next.dataMode === "live") {
        setError("Event key is required in Live mode.");
        return;
      }

      const previous = await getSettings();
      if (previous.eventKey && previous.eventKey !== next.eventKey) {
        await clearAllRuns();
      }

      await saveSettings(next);
      setForm(next);
      setMessage("Settings saved.");
    } catch (saveError) {
      setError(`Could not save settings: ${(saveError as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="col" style={{ gap: 12 }}>
      <h1 style={{ margin: 0 }}>Settings</h1>
      <div className="label">Manual event setup for shared pit device mode.</div>

      <form className="card col" onSubmit={onSave}>
        <label className="col" style={{ gap: 4 }}>
          <span className="label">Team Number</span>
          <input
            type="number"
            min={1}
            value={form.teamNumber}
            onChange={(event) => setForm((prev) => ({ ...prev, teamNumber: Number(event.target.value) }))}
          />
        </label>

        <label className="col" style={{ gap: 4 }}>
          <span className="label">Event Key</span>
          <input
            type="text"
            placeholder="2026casj"
            value={form.eventKey}
            onChange={(event) => setForm((prev) => ({ ...prev, eventKey: event.target.value }))}
          />
        </label>

        <label className="col" style={{ gap: 4 }}>
          <span className="label">Queue Lead Time (minutes)</span>
          <input
            type="number"
            min={1}
            value={form.queueLeadMinutes}
            onChange={(event) => setForm((prev) => ({ ...prev, queueLeadMinutes: Number(event.target.value) }))}
          />
        </label>

        <label className="col" style={{ gap: 4 }}>
          <span className="label">Data Mode</span>
          <select
            value={form.dataMode}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, dataMode: event.target.value === "mock" ? "mock" : "live" }))
            }
          >
            <option value="live">Live (Nexus → TBA fallback)</option>
            <option value="mock">Mock (generated test schedule)</option>
          </select>
          <span className="label">
            Use Mock mode before event data is available to test queue cards, checklist flow, and history.
          </span>
        </label>

        <button className="button" type="submit" disabled={!loaded || saving}>
          {saving ? "Saving..." : "Save Settings"}
        </button>
        {message ? <div className="inline-msg ok">{message}</div> : null}
        {error ? <div className="inline-msg warn">{error}</div> : null}
      </form>

      <section className="card col">
        <h2 style={{ margin: 0 }}>Env Vars</h2>
        <div className="label">Set these on deploy/runtime:</div>
        <code>NEXUS_API_KEY</code>
        <code>TBA_API_KEY</code>
        <code>NEXUS_BASE_URL (optional)</code>
        <code>TBA_BASE_URL (optional)</code>
      </section>
    </div>
  );
}
