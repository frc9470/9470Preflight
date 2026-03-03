import type { ChecklistStep, PreflightActionCard, PreflightRunState, StepResponse } from "@/src/types/domain";

export function isResponseComplete(response: StepResponse | undefined): boolean {
  if (!response) {
    return false;
  }
  if (response.passed) {
    return true;
  }
  return Boolean(response.overridden && response.overrideReason && response.overrideReason.trim().length > 0);
}

export function isResponseNavigable(response: StepResponse | undefined): boolean {
  if (!response) {
    return false;
  }

  if (isResponseComplete(response)) {
    return true;
  }

  if (
    response?.inProgress &&
    response.actionCardId &&
    response.actionSummary &&
    response.actionSummary.trim().length > 0
  ) {
    return true;
  }

  // Failed checks are still considered answered so pit crew can continue flow.
  return true;
}

export function isStepPassing(step: ChecklistStep, response: StepResponse): boolean {
  if (step.kind === "boolean") {
    return Boolean(response.valueBoolean);
  }

  if (step.kind === "number") {
    if (typeof response.valueNumber !== "number" || Number.isNaN(response.valueNumber)) {
      return false;
    }
    return step.min !== undefined ? response.valueNumber > step.min : true;
  }

  if (typeof response.valueCount !== "number" || Number.isNaN(response.valueCount)) {
    return false;
  }
  return step.min !== undefined ? response.valueCount >= step.min : true;
}

export function computeRunState(
  steps: ChecklistStep[],
  responses: StepResponse[],
  actionCards: PreflightActionCard[] = []
): PreflightRunState {
  const completedSteps = steps.filter((step) => {
    const response = responses.find((item) => item.stepId === step.id);
    return isResponseComplete(response);
  }).length;

  const hasOpenActionCards = actionCards.some((card) => card.status === "OPEN");

  if (completedSteps === steps.length && !hasOpenActionCards) {
    return "READY";
  }

  const hasFailedUnresolved = responses.some(
    (response) =>
      !response.passed &&
      !(response.overridden && response.overrideReason && response.overrideReason.trim().length > 0) &&
      !response.inProgress
  );

  if (hasFailedUnresolved || hasOpenActionCards) {
    return "BLOCKED";
  }

  return "IN_PROGRESS";
}
