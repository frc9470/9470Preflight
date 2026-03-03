import { describe, expect, test } from "vitest";

import { buildMockMatches } from "../src/integrations/mock";

describe("mock matches", () => {
  test("generates upcoming cards for the configured team", () => {
    const matches = buildMockMatches({
      teamNumber: 9470,
      eventKey: "practice",
      leadMinutes: 20,
      count: 4
    });

    expect(matches).toHaveLength(4);
    expect(matches.every((match) => match.source === "MOCK")).toBe(true);
    expect(matches.every((match) => match.allianceTeams.includes(9470))).toBe(true);
    expect(matches.every((match) => match.queueTimeIso !== null)).toBe(true);
  });
});
