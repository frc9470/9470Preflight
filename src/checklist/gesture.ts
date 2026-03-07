export type SwipeDecision = "pass" | "delay";

export type SwipeDecisionInput = {
  dx: number;
  dy: number;
  cardWidth: number;
  startClientX: number;
  viewportWidth: number;
  edgeGutter?: number;
};

export const SWIPE_EDGE_GUTTER_PX = 20;

export function swipeCommitThreshold(cardWidth: number): number {
  return Math.max(72, cardWidth * 0.22);
}

export function classifySwipeDecision(input: SwipeDecisionInput): SwipeDecision | null {
  const {
    dx,
    dy,
    cardWidth,
    startClientX,
    viewportWidth,
    edgeGutter = SWIPE_EDGE_GUTTER_PX
  } = input;

  if (startClientX <= edgeGutter || startClientX >= viewportWidth - edgeGutter) {
    return null;
  }

  if (Math.abs(dx) < swipeCommitThreshold(cardWidth)) {
    return null;
  }

  if (Math.abs(dx) <= Math.abs(dy) * 1.4) {
    return null;
  }

  return dx > 0 ? "pass" : "delay";
}
