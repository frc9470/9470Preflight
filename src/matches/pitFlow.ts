import type { MatchCard } from "../types/domain";

export type PitStage = "QUEUE_NOW" | "QUEUE_SOON" | "PREP_NEXT" | "LATER" | "COMPLETED";

export function minutesUntil(iso: string | null, now = Date.now()): number | null {
  if (!iso) {
    return null;
  }
  return Math.round((new Date(iso).getTime() - now) / 60000);
}

export function queueCountdown(iso: string | null, now = Date.now()): string {
  const minutes = minutesUntil(iso, now);
  if (minutes === null) {
    return "Queue time unavailable";
  }
  if (minutes > 59) {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m to queue`;
  }
  if (minutes > 0) {
    return `${minutes} min to queue`;
  }
  if (minutes === 0) {
    return "Queue now";
  }
  return `${Math.abs(minutes)} min past queue`;
}

export function isQueueSoon(match: MatchCard, now = Date.now()): boolean {
  const minutes = minutesUntil(match.queueTimeIso, now);
  return minutes !== null && minutes <= 15 && minutes >= -5;
}

export function isNowQueueing(match: MatchCard, now = Date.now()): boolean {
  if (match.status === "QUEUE" || match.status === "ON_DECK" || match.status === "ON_FIELD_SOON") {
    return true;
  }
  return isQueueSoon(match, now);
}

export function getPitStage(match: MatchCard, now = Date.now()): PitStage {
  if (match.status === "COMPLETED") {
    return "COMPLETED";
  }

  const queueMinutes = minutesUntil(match.queueTimeIso, now);

  if (
    match.status === "QUEUE" ||
    match.status === "ON_DECK" ||
    match.status === "ON_FIELD_SOON" ||
    (queueMinutes !== null && queueMinutes <= 0)
  ) {
    return "QUEUE_NOW";
  }

  if (queueMinutes !== null && queueMinutes <= 15) {
    return "QUEUE_SOON";
  }

  if (queueMinutes !== null && queueMinutes <= 45) {
    return "PREP_NEXT";
  }

  return "LATER";
}
