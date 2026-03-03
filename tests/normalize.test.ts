import { describe, expect, test } from "vitest";

import { buildMatchCard, sortMatches } from "../src/integrations/normalize";

describe("match normalization", () => {
  test("derives queue time from expected start and lead time", () => {
    const now = new Date("2026-03-03T10:00:00.000Z");
    const expected = "2026-03-03T10:30:00.000Z";

    const card = buildMatchCard(
      {
        matchKey: "2026test_qm1",
        source: "TBA",
        compLevelRaw: "qm",
        matchNumber: 1,
        teamNumber: 9470,
        redTeams: [9470, 9999, 111],
        blueTeams: [222, 333, 444],
        expectedStartTimeRaw: expected,
        leadMinutes: 20
      },
      now
    );

    expect(card.allianceColor).toBe("red");
    expect(card.queueTimeIso).toBe("2026-03-03T10:10:00.000Z");
  });

  test("sorts by expected start then match number", () => {
    const now = new Date("2026-03-03T10:00:00.000Z");
    const b = buildMatchCard(
      {
        matchKey: "b",
        source: "TBA",
        compLevelRaw: "qm",
        matchNumber: 2,
        teamNumber: 9470,
        redTeams: [9470, 1, 2],
        blueTeams: [3, 4, 5],
        expectedStartTimeRaw: "2026-03-03T10:30:00.000Z",
        leadMinutes: 20
      },
      now
    );
    const a = buildMatchCard(
      {
        matchKey: "a",
        source: "TBA",
        compLevelRaw: "qm",
        matchNumber: 1,
        teamNumber: 9470,
        redTeams: [9470, 1, 2],
        blueTeams: [3, 4, 5],
        expectedStartTimeRaw: "2026-03-03T10:20:00.000Z",
        leadMinutes: 20
      },
      now
    );

    const sorted = sortMatches([b, a]);
    expect(sorted[0].matchKey).toBe("a");
    expect(sorted[1].matchKey).toBe("b");
  });
});
