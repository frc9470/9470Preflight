import type { MatchCard } from "@/src/types/domain";

type MockOptions = {
  teamNumber: number;
  eventKey: string;
  leadMinutes: number;
  count?: number;
};

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function statusFromTimes(now: Date, queue: Date, onDeck: Date, onField: Date): MatchCard["status"] {
  if (now >= onField) {
    return "ON_FIELD_SOON";
  }
  if (now >= onDeck) {
    return "ON_DECK";
  }
  if (now >= queue) {
    return "QUEUE";
  }
  return "UPCOMING";
}

export function buildMockMatches(options: MockOptions): MatchCard[] {
  const now = new Date();
  const count = options.count ?? 6;

  const canned = [
    [1114, 1678, 6328],
    [254, 971, 1323],
    [604, 8033, 670],
    [581, 5940, 4414],
    [649, 846, 973],
    [115, 2485, 4270],
    [199, 1257, 3476],
    [1538, 701, 852]
  ];

  const matches: MatchCard[] = [];

  for (let i = 0; i < count; i += 1) {
    const expected = addMinutes(now, 8 + i * 10);
    const queue = addMinutes(expected, -options.leadMinutes);
    const onDeck = addMinutes(expected, -5);
    const onField = addMinutes(expected, -1);

    const isRed = i % 2 === 0;
    const partnerIndex = i % canned.length;
    const opponentIndex = (i + 3) % canned.length;

    const redTeams = isRed
      ? [options.teamNumber, canned[partnerIndex][0], canned[partnerIndex][1]]
      : [canned[opponentIndex][0], canned[opponentIndex][1], canned[opponentIndex][2]];
    const blueTeams = isRed
      ? [canned[opponentIndex][0], canned[opponentIndex][1], canned[opponentIndex][2]]
      : [options.teamNumber, canned[partnerIndex][0], canned[partnerIndex][1]];

    const allianceColor = isRed ? "red" : "blue";

    matches.push({
      matchKey: `${options.eventKey}_qm${i + 1}`,
      source: "MOCK",
      compLevel: "qm",
      matchNumber: i + 1,
      allianceColor,
      allianceTeams: allianceColor === "red" ? redTeams : blueTeams,
      opponentTeams: allianceColor === "red" ? blueTeams : redTeams,
      expectedStartTimeIso: expected.toISOString(),
      queueTimeIso: queue.toISOString(),
      onDeckTimeIso: onDeck.toISOString(),
      onFieldTimeIso: onField.toISOString(),
      status: statusFromTimes(now, queue, onDeck, onField),
      isFallback: false,
      lastUpdatedIso: now.toISOString()
    });
  }

  return matches;
}
