import { describe, expect, test } from "vitest";

import { computeRunState, isResponseComplete, isResponseNavigable, isStepPassing } from "../src/checklist/evaluation";
import type { ChecklistStep, PreflightActionCard, StepResponse } from "../src/types/domain";

function makeResponse(stepId: string, patch: Partial<StepResponse>): StepResponse {
  return {
    stepId,
    passed: false,
    overridden: false,
    overrideReason: "",
    updatedAtIso: new Date().toISOString(),
    ...patch
  };
}

describe("checklist evaluation", () => {
  test("number step rejects values <=13.0", () => {
    const step: ChecklistStep = {
      id: "battery",
      section: "cold",
      prompt: "Battery",
      kind: "number",
      required: true,
      min: 13.000001
    };

    expect(isStepPassing(step, makeResponse(step.id, { valueNumber: 13 }))).toBe(false);
    expect(isStepPassing(step, makeResponse(step.id, { valueNumber: 13.05 }))).toBe(true);
  });

  test("counter step rejects values below minimum", () => {
    const step: ChecklistStep = {
      id: "deploy",
      section: "hot",
      prompt: "Deploy",
      kind: "counter",
      required: true,
      min: 5
    };

    expect(isStepPassing(step, makeResponse(step.id, { valueCount: 4 }))).toBe(false);
    expect(isStepPassing(step, makeResponse(step.id, { valueCount: 5 }))).toBe(true);
  });

  test("failed response is complete only when override reason is present", () => {
    expect(isResponseComplete(makeResponse("x", { passed: false, overridden: false, overrideReason: "" }))).toBe(false);
    expect(isResponseComplete(makeResponse("x", { passed: false, overridden: true, overrideReason: "mentor approved" }))).toBe(true);
  });

  test("failed responses are navigable once answered", () => {
    expect(
      isResponseNavigable(
        makeResponse("x", {
          passed: false
        })
      )
    ).toBe(true);
    expect(
      isResponseNavigable(
        undefined
      )
    ).toBe(false);
  });

  test("run state blocks unresolved failures and becomes READY when all complete", () => {
    const steps: ChecklistStep[] = [
      { id: "a", section: "cold", prompt: "A", kind: "boolean", required: true },
      { id: "b", section: "cold", prompt: "B", kind: "boolean", required: true }
    ];

    const blockedResponses = [
      makeResponse("a", { passed: true, valueBoolean: true }),
      makeResponse("b", { passed: false, valueBoolean: false, overridden: false, overrideReason: "" })
    ];

    const readyResponses = [
      makeResponse("a", { passed: true, valueBoolean: true }),
      makeResponse("b", { passed: false, valueBoolean: false, overridden: true, overrideReason: "accepted risk" })
    ];

    const openActionCards: PreflightActionCard[] = [
      {
        id: "card-a",
        stepId: "b",
        stepPrompt: "B",
        note: "Fix this",
        status: "OPEN",
        createdAtIso: new Date().toISOString()
      }
    ];

    expect(computeRunState(steps, blockedResponses)).toBe("BLOCKED");
    expect(computeRunState(steps, readyResponses, openActionCards)).toBe("BLOCKED");
    expect(computeRunState(steps, readyResponses, [])).toBe("READY");
  });
});
