import { describe, expect, test } from "vitest";

import { getPitStage, isNowQueueing, queueCountdown } from "../src/matches/pitFlow";
import type { MatchCard } from "../src/types/domain";

function makeMatch(patch: Partial<MatchCard>): MatchCard {
  return {
    matchKey: "practice_qm1",
    source: "MOCK",
    compLevel: "qm",
    matchNumber: 1,
    allianceColor: "red",
    allianceTeams: [9470, 1114, 1678],
    opponentTeams: [254, 971, 1323],
    expectedStartTimeIso: "2026-03-06T20:35:00.000Z",
    queueTimeIso: "2026-03-06T20:15:00.000Z",
    onDeckTimeIso: "2026-03-06T20:30:00.000Z",
    onFieldTimeIso: "2026-03-06T20:34:00.000Z",
    status: "UPCOMING",
    isFallback: false,
    lastUpdatedIso: "2026-03-06T20:00:00.000Z",
    ...patch
  };
}

describe("pit timing helpers", () => {
  test("returns relative queue countdown strings", () => {
    expect(queueCountdown("2026-03-06T20:15:00.000Z", Date.parse("2026-03-06T20:07:00.000Z"))).toBe("8 min to queue");
    expect(queueCountdown("2026-03-06T20:15:00.000Z", Date.parse("2026-03-06T20:17:00.000Z"))).toBe("2 min past queue");
  });

  test("promotes near-term matches into queue-soon stage", () => {
    const match = makeMatch({});

    expect(getPitStage(match, Date.parse("2026-03-06T20:07:00.000Z"))).toBe("QUEUE_SOON");
    expect(isNowQueueing(match, Date.parse("2026-03-06T20:07:00.000Z"))).toBe(true);
  });

  test("treats field states as queue-now regardless of countdown math", () => {
    const onDeck = makeMatch({ status: "ON_DECK" });

    expect(getPitStage(onDeck, Date.parse("2026-03-06T20:00:00.000Z"))).toBe("QUEUE_NOW");
    expect(isNowQueueing(onDeck, Date.parse("2026-03-06T20:00:00.000Z"))).toBe(true);
  });
});
