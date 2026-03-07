import { describe, expect, test } from "vitest";

import { classifySwipeDecision, swipeCommitThreshold } from "../src/checklist/gesture";

describe("swipe gesture classifier", () => {
  test("commits pass when horizontal drag clears threshold", () => {
    expect(
      classifySwipeDecision({
        dx: 110,
        dy: 20,
        cardWidth: 320,
        startClientX: 120,
        viewportWidth: 390
      })
    ).toBe("pass");
  });

  test("commits delay when horizontal drag clears threshold to the left", () => {
    expect(
      classifySwipeDecision({
        dx: -96,
        dy: 18,
        cardWidth: 320,
        startClientX: 180,
        viewportWidth: 390
      })
    ).toBe("delay");
  });

  test("rejects edge-start gestures", () => {
    expect(
      classifySwipeDecision({
        dx: 120,
        dy: 8,
        cardWidth: 320,
        startClientX: 10,
        viewportWidth: 390
      })
    ).toBeNull();
  });

  test("rejects mostly vertical drags", () => {
    expect(
      classifySwipeDecision({
        dx: 90,
        dy: 70,
        cardWidth: 320,
        startClientX: 140,
        viewportWidth: 390
      })
    ).toBeNull();
  });

  test("rejects drags below threshold", () => {
    const cardWidth = 320;

    expect(swipeCommitThreshold(cardWidth)).toBe(72);
    expect(
      classifySwipeDecision({
        dx: 60,
        dy: 4,
        cardWidth,
        startClientX: 140,
        viewportWidth: 390
      })
    ).toBeNull();
  });
});
