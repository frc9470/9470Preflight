"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

import {
  computeRunState,
  isResponseComplete,
  isResponseNavigable,
  isStepPassing
} from "@/src/checklist/evaluation";
import { PRE_FLIGHT_9470_STEPS } from "@/src/checklist/preflight9470";
import { getRun, getSettings, saveRun } from "@/src/storage/localDb";
import type {
  AppSettings,
  ChecklistStep,
  PreflightActionCard,
  PreflightRun,
  StepResponse
} from "@/src/types/domain";

type UndoState = {
  run: PreflightRun;
  stepIndex: number;
  label: string;
};

function getResponse(run: PreflightRun | null, stepId: string): StepResponse | undefined {
  return run?.responses.find((response) => response.stepId === stepId);
}

function getStepById(stepId: string): ChecklistStep | undefined {
  return PRE_FLIGHT_9470_STEPS.find((step) => step.id === stepId);
}

function firstIncompleteIndex(run: PreflightRun | null): number {
  if (!run) {
    return 0;
  }
  const index = PRE_FLIGHT_9470_STEPS.findIndex((step) => !isResponseNavigable(getResponse(run, step.id)));
  return index === -1 ? PRE_FLIGHT_9470_STEPS.length - 1 : index;
}

function hasOverrideReason(response: StepResponse): boolean {
  return Boolean(response.overridden && response.overrideReason && response.overrideReason.trim().length > 0);
}

function migrateLegacyFailedSteps(existingRun: PreflightRun): { run: PreflightRun; migrated: boolean } {
  const nextCards: PreflightActionCard[] = [...existingRun.actionCards];
  let changed = false;

  const nextResponses = existingRun.responses.map((response) => {
    if (response.passed || hasOverrideReason(response) || response.inProgress) {
      return response;
    }

    const stepDef = getStepById(response.stepId);
    if (!stepDef) {
      return response;
    }

    let card = nextCards.find((item) => item.stepId === response.stepId && item.status === "OPEN");
    if (!card) {
      const createdAtIso = response.updatedAtIso || new Date().toISOString();
      card = {
        id: `${existingRun.runId}:${response.stepId}:migrated:${Date.now()}`,
        stepId: response.stepId,
        stepPrompt: stepDef.prompt,
        note: `Delayed: ${stepDef.prompt}`,
        status: "OPEN",
        createdAtIso
      };
      nextCards.push(card);
      changed = true;
    }

    changed = true;
    return {
      ...response,
      inProgress: true,
      actionCardId: card.id,
      actionSummary: card.note,
      actionAssignee: card.assignee,
      overridden: false,
      overrideReason: "",
      updatedAtIso: new Date().toISOString()
    };
  });

  if (!changed) {
    return { run: existingRun, migrated: false };
  }

  const migratedRun: PreflightRun = {
    ...existingRun,
    responses: nextResponses,
    actionCards: nextCards,
    state: computeRunState(PRE_FLIGHT_9470_STEPS, nextResponses, nextCards)
  };

  return { run: migratedRun, migrated: true };
}

function upsertResponse(responses: StepResponse[], next: StepResponse): StepResponse[] {
  const existingIndex = responses.findIndex((item) => item.stepId === next.stepId);
  if (existingIndex === -1) {
    return [...responses, next];
  }
  const clone = [...responses];
  clone[existingIndex] = next;
  return clone;
}

function closeActionCardsForStep(cards: PreflightActionCard[], stepId: string): PreflightActionCard[] {
  const nowIso = new Date().toISOString();
  return cards.map((card) => {
    if (card.stepId === stepId && card.status === "OPEN") {
      return {
        ...card,
        status: "DONE",
        resolvedAtIso: nowIso
      };
    }
    return card;
  });
}

function normalizeResponse(step: ChecklistStep, response: StepResponse): StepResponse {
  const withPassFlag: StepResponse = {
    ...response,
    passed: isStepPassing(step, response),
    updatedAtIso: new Date().toISOString()
  };

  const hasOverride = Boolean(
    withPassFlag.overridden && withPassFlag.overrideReason && withPassFlag.overrideReason.trim().length > 0
  );

  if (withPassFlag.passed) {
    return {
      ...withPassFlag,
      overridden: false,
      overrideReason: "",
      inProgress: false,
      actionCardId: undefined,
      actionSummary: undefined,
      actionAssignee: undefined
    };
  }

  if (hasOverride) {
    return {
      ...withPassFlag,
      inProgress: false,
      actionCardId: undefined,
      actionSummary: undefined,
      actionAssignee: undefined
    };
  }

  if (!withPassFlag.inProgress) {
    return {
      ...withPassFlag,
      actionCardId: undefined,
      actionSummary: undefined,
      actionAssignee: undefined
    };
  }

  return withPassFlag;
}

function cloneRun(run: PreflightRun): PreflightRun {
  return JSON.parse(JSON.stringify(run)) as PreflightRun;
}

function formatCardAge(createdAtIso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(createdAtIso).getTime()) / 60000));
  if (minutes < 1) {
    return "just now";
  }
  if (minutes === 1) {
    return "1 min";
  }
  return `${minutes} min`;
}

function statCounts(responses: StepResponse[]): {
  passed: number;
  overridden: number;
  inProgress: number;
  blocked: number;
  unanswered: number;
} {
  let passed = 0;
  let overridden = 0;
  let inProgress = 0;
  let blocked = 0;
  let unanswered = 0;

  for (const step of PRE_FLIGHT_9470_STEPS) {
    const response = responses.find((item) => item.stepId === step.id);
    if (!response) {
      unanswered += 1;
      continue;
    }
    if (response.passed) {
      passed += 1;
      continue;
    }
    if (response.overridden && response.overrideReason?.trim()) {
      overridden += 1;
      continue;
    }
    if (response.inProgress) {
      inProgress += 1;
      continue;
    }
    blocked += 1;
  }

  return { passed, overridden, inProgress, blocked, unanswered };
}

function runStatusClass(state: PreflightRun["state"]): string {
  if (state === "READY") {
    return "field";
  }
  if (state === "BLOCKED") {
    return "queue";
  }
  return "upcoming";
}

function isBatteryVoltageStep(step: ChecklistStep): boolean {
  return step.id === "cold-15";
}

function isCameraCountStep(step: ChecklistStep): boolean {
  return step.id === "cold-6" || step.id === "hot-2";
}

function requirementText(step: ChecklistStep): string {
  if (step.kind === "number") {
    return `Requirement: value > ${Number(step.min ?? 0).toFixed(1)}V`;
  }
  if (step.kind === "counter") {
    if (step.id === "cold-6") {
      return "Requirement: camera count > 2";
    }
    return `Requirement: count >= ${step.min ?? 0}`;
  }
  return "";
}

function buildDecisionDraft(
  step: ChecklistStep,
  existing: StepResponse | undefined,
  shouldPass: boolean,
  openCard?: PreflightActionCard
): StepResponse {
  const min = step.min ?? 0;

  if (step.kind === "boolean") {
    return {
      stepId: step.id,
      valueBoolean: shouldPass,
      valueNumber: existing?.valueNumber,
      valueCount: existing?.valueCount,
      passed: shouldPass,
      overridden: false,
      overrideReason: "",
      inProgress: shouldPass ? false : Boolean(openCard),
      actionCardId: shouldPass ? undefined : openCard?.id,
      actionSummary: shouldPass ? undefined : openCard?.note,
      actionAssignee: shouldPass ? undefined : openCard?.assignee,
      updatedAtIso: new Date().toISOString()
    };
  }

  if (step.kind === "number") {
    const entered = typeof existing?.valueNumber === "number" && !Number.isNaN(existing.valueNumber)
      ? existing.valueNumber
      : undefined;

    const passingValue = entered !== undefined && entered > min ? entered : min + 0.1;
    const failingValue = entered !== undefined && entered <= min ? entered : Math.max(0, min - 0.1);

    return {
      stepId: step.id,
      valueBoolean: existing?.valueBoolean,
      valueNumber: shouldPass ? passingValue : failingValue,
      valueCount: undefined,
      passed: shouldPass,
      overridden: false,
      overrideReason: "",
      inProgress: shouldPass ? false : Boolean(openCard),
      actionCardId: shouldPass ? undefined : openCard?.id,
      actionSummary: shouldPass ? undefined : openCard?.note,
      actionAssignee: shouldPass ? undefined : openCard?.assignee,
      updatedAtIso: new Date().toISOString()
    };
  }

  const enteredCount = typeof existing?.valueCount === "number" && !Number.isNaN(existing.valueCount)
    ? existing.valueCount
    : undefined;
  const passingCount = enteredCount !== undefined && enteredCount >= min ? enteredCount : Math.max(min, 1);
  const failingCount = enteredCount !== undefined && enteredCount < min ? enteredCount : Math.max(0, min - 1);

  return {
    stepId: step.id,
    valueBoolean: existing?.valueBoolean,
    valueNumber: undefined,
    valueCount: shouldPass ? passingCount : failingCount,
    passed: shouldPass,
    overridden: false,
    overrideReason: "",
    inProgress: shouldPass ? false : Boolean(openCard),
    actionCardId: shouldPass ? undefined : openCard?.id,
    actionSummary: shouldPass ? undefined : openCard?.note,
    actionAssignee: shouldPass ? undefined : openCard?.assignee,
    updatedAtIso: new Date().toISOString()
  };
}

export default function PreflightPage(): React.JSX.Element {
  const params = useParams<{ matchKey: string }>();
  const rawMatchKey = params.matchKey;
  const matchKey = decodeURIComponent(Array.isArray(rawMatchKey) ? rawMatchKey[0] : rawMatchKey ?? "");

  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [run, setRun] = useState<PreflightRun | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [undoState, setUndoState] = useState<UndoState | null>(null);

  useEffect(() => {
    const load = async (): Promise<void> => {
      const appSettings = await getSettings();
      setSettings(appSettings);

      if (!appSettings.eventKey) {
        setRun(null);
        setUndoState(null);
        return;
      }

      const existing = await getRun(appSettings.eventKey, matchKey);
      if (existing) {
        const migrated = migrateLegacyFailedSteps(existing);
        if (migrated.migrated) {
          await saveRun(migrated.run);
        }
        setRun(migrated.run);
        setUndoState(null);
        setStepIndex(firstIncompleteIndex(migrated.run));
        return;
      }

      const fresh: PreflightRun = {
        runId: `${appSettings.eventKey}:${matchKey}:${Date.now()}`,
        eventKey: appSettings.eventKey,
        matchKey,
        state: "IN_PROGRESS",
        startedAtIso: new Date().toISOString(),
        responses: [],
        actionCards: []
      };
      await saveRun(fresh);
      setRun(fresh);
      setUndoState(null);
      setStepIndex(0);
    };

    void load();
  }, [matchKey]);

  const step = PRE_FLIGHT_9470_STEPS[stepIndex];
  const currentResponse = run && step ? getResponse(run, step.id) : undefined;
  const openActionCards = useMemo(
    () => (run?.actionCards ?? []).filter((card) => card.status === "OPEN"),
    [run?.actionCards]
  );
  const counts = useMemo(() => statCounts(run?.responses ?? []), [run?.responses]);
  const isLocked = run?.state === "READY";

  const traversedSteps = useMemo(
    () => PRE_FLIGHT_9470_STEPS.filter((item) => isResponseNavigable(getResponse(run, item.id))).length,
    [run]
  );

  const progressPercent = Math.round((traversedSteps / PRE_FLIGHT_9470_STEPS.length) * 100);
  const doneCount = counts.passed + counts.overridden;
  const cameraStep = isCameraCountStep(step);
  const batteryStep = isBatteryVoltageStep(step);
  const measuredNumberValue =
    step.kind === "number"
      ? (typeof currentResponse?.valueNumber === "number" ? currentResponse.valueNumber : 12.8)
      : null;
  const measuredCountValue =
    step.kind === "counter"
      ? (typeof currentResponse?.valueCount === "number" ? currentResponse.valueCount : 0)
      : null;

  const persistRun = async (nextRun: PreflightRun): Promise<void> => {
    setRun(nextRun);
    await saveRun(nextRun);
  };

  const autoAdvance = (): void => {
    setStepIndex((prev) => Math.min(PRE_FLIGHT_9470_STEPS.length - 1, prev + 1));
  };

  const commitStepResponse = async (
    nextStep: ChecklistStep,
    draftResponse: StepResponse,
    nextCards: PreflightActionCard[],
    nextMessage?: string
  ): Promise<void> => {
    if (!run || isLocked) {
      return;
    }

    const scored = normalizeResponse(nextStep, draftResponse);

    const cardsToUse =
      scored.passed || (scored.overridden && scored.overrideReason?.trim())
        ? closeActionCardsForStep(nextCards, nextStep.id)
        : nextCards;

    const responses = upsertResponse(run.responses, scored);

    const nextRun: PreflightRun = {
      ...run,
      responses,
      actionCards: cardsToUse,
      state: computeRunState(PRE_FLIGHT_9470_STEPS, responses, cardsToUse)
    };

    await persistRun(nextRun);
    if (nextMessage) {
      setMessage(nextMessage);
    }
  };

  const setDecision = async (shouldPass: boolean): Promise<void> => {
    if (!run || !step || isLocked) {
      return;
    }

    const undoSnapshot = cloneRun(run);
    const undoStepIndex = stepIndex;
    const prev = getResponse(run, step.id);
    const openCard = openActionCards.find((card) => card.stepId === step.id);
    const draft = buildDecisionDraft(step, prev, shouldPass, openCard);

    await commitStepResponse(step, draft, run.actionCards);
    autoAdvance();
    setUndoState({
      run: undoSnapshot,
      stepIndex: undoStepIndex,
      label: shouldPass ? `Pass ${step.id}` : `Update ${step.id}`
    });
  };

  const setNumberLike = async (value: number): Promise<void> => {
    if (!run || !step || step.kind === "boolean") {
      return;
    }

    const prev = getResponse(run, step.id);
    const openCard = openActionCards.find((card) => card.stepId === step.id);

    const draft: StepResponse = {
      stepId: step.id,
      valueBoolean: prev?.valueBoolean,
      valueNumber: step.kind === "number" ? value : undefined,
      valueCount: step.kind === "counter" ? Math.trunc(value) : undefined,
      passed: false,
      overridden: false,
      overrideReason: "",
      inProgress: Boolean(openCard),
      actionCardId: openCard?.id,
      actionSummary: openCard?.note,
      actionAssignee: openCard?.assignee,
      updatedAtIso: new Date().toISOString()
    };

    await commitStepResponse(step, draft, run.actionCards);
  };

  const delayStep = async (): Promise<void> => {
    if (!run || !step || isLocked) {
      return;
    }

    const undoSnapshot = cloneRun(run);
    const undoStepIndex = stepIndex;

    const existingCard = openActionCards.find((card) => card.stepId === step.id);
    if (existingCard) {
      autoAdvance();
      setUndoState({
        run: undoSnapshot,
        stepIndex: undoStepIndex,
        label: `Delay ${step.id}`
      });
      return;
    }

    const createdAtIso = new Date().toISOString();
    const cardId = `${run.runId}:${step.id}:${Date.now()}`;
    const note = `Delayed: ${step.prompt}`;
    const closedPriorCards = closeActionCardsForStep(run.actionCards, step.id);

    const newCard: PreflightActionCard = {
      id: cardId,
      stepId: step.id,
      stepPrompt: step.prompt,
      note,
      assignee: undefined,
      status: "OPEN",
      createdAtIso
    };

    const prev = getResponse(run, step.id);

    const draft: StepResponse = {
      stepId: step.id,
      valueBoolean: step.kind === "boolean" ? false : prev?.valueBoolean,
      valueNumber: step.kind === "number" ? prev?.valueNumber : undefined,
      valueCount: step.kind === "counter" ? prev?.valueCount : undefined,
      passed: false,
      overridden: false,
      overrideReason: "",
      inProgress: true,
      actionCardId: newCard.id,
      actionSummary: newCard.note,
      actionAssignee: undefined,
      updatedAtIso: createdAtIso
    };

    await commitStepResponse(step, draft, [...closedPriorCards, newCard], "Step delayed.");
    autoAdvance();
    setUndoState({
      run: undoSnapshot,
      stepIndex: undoStepIndex,
      label: `Delay ${step.id}`
    });
  };

  const markActionCardFixed = async (cardId: string): Promise<void> => {
    if (!run || isLocked) {
      return;
    }

    const undoSnapshot = cloneRun(run);
    const undoStepIndex = stepIndex;

    const card = run.actionCards.find((item) => item.id === cardId);
    if (!card || card.status !== "OPEN") {
      return;
    }

    const stepDef = getStepById(card.stepId);
    if (!stepDef) {
      return;
    }

    const prev = getResponse(run, card.stepId);
    const draft = buildDecisionDraft(stepDef, prev, true);
    const scored = normalizeResponse(stepDef, draft);
    const responses = upsertResponse(run.responses, scored);

    const cards = run.actionCards.map((item) =>
      item.id === card.id
        ? {
            ...item,
            status: "DONE" as const,
            resolvedAtIso: new Date().toISOString()
          }
        : item
    );

    const nextRun: PreflightRun = {
      ...run,
      responses,
      actionCards: cards,
      state: computeRunState(PRE_FLIGHT_9470_STEPS, responses, cards)
    };

    await persistRun(nextRun);
    setMessage(`Card passed for ${stepDef.id}.`);
    setUndoState({
      run: undoSnapshot,
      stepIndex: undoStepIndex,
      label: `Mark pass ${stepDef.id}`
    });
  };

  const allComplete = PRE_FLIGHT_9470_STEPS.every((item) => isResponseComplete(getResponse(run, item.id)));
  const canFinalize = allComplete && openActionCards.length === 0;

  const markReady = async (): Promise<void> => {
    if (!run || !canFinalize || isLocked) {
      return;
    }

    const undoSnapshot = cloneRun(run);
    const undoStepIndex = stepIndex;
    const finalized: PreflightRun = {
      ...run,
      state: "READY",
      completedAtIso: new Date().toISOString()
    };

    await persistRun(finalized);
    setMessage("Match marked READY.");
    setUndoState({
      run: undoSnapshot,
      stepIndex: undoStepIndex,
      label: "Mark match ready"
    });
  };

  const undoLastAction = async (): Promise<void> => {
    if (!undoState) {
      return;
    }
    await persistRun(undoState.run);
    setStepIndex(undoState.stepIndex);
    setMessage(`Undid: ${undoState.label}.`);
    setUndoState(null);
  };

  if (!settings?.eventKey) {
    return <div className="card">Set event key in Settings before running preflight.</div>;
  }

  if (!run || !step) {
    return <div className="card">Loading preflight run...</div>;
  }

  return (
    <div className="preflight-shell">
      <section className="card preflight-overview">
        <div className="preflight-head">
          <div>
            <h1>Preflight</h1>
            <div className="label">{settings.eventKey}</div>
            <div className="value preflight-match-key">{matchKey}</div>
          </div>
          <span className={`pill ${runStatusClass(run.state)}`}>{run.state.replaceAll("_", " ")}</span>
        </div>

        <div className="progress-block">
          <div className="progress-meta compact">
            <span className="value progress-percent">{progressPercent}%</span>
            <span className="label">Step {stepIndex + 1} / {PRE_FLIGHT_9470_STEPS.length}</span>
            <span className="label">Done {doneCount}</span>
            <span className="label">Delayed {counts.inProgress}</span>
            <span className="label">Blocking {counts.blocked}</span>
          </div>
          <div className="progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressPercent}>
            <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
          </div>
        </div>
      </section>

      <section className="card step-card">
        <div className="step-title-row">
          <div className="step-kicker">Step {stepIndex + 1} of {PRE_FLIGHT_9470_STEPS.length}</div>
          {currentResponse?.inProgress ? <span className="pill queue">Delayed</span> : null}
        </div>
        <div className="step-subcategory">{step.category ?? "General"}</div>
        <h2 className="step-prompt">{step.prompt}</h2>

        {step.kind !== "boolean" ? (
          <div className="measurement-panel">
            {batteryStep ? (
              <>
                <div className="measurement-header">
                  <span className="label">Battery voltage</span>
                  <span className="value meter-value">{measuredNumberValue?.toFixed(2)}V</span>
                </div>
                <input
                  className="battery-range"
                  type="range"
                  min={11}
                  max={14}
                  step={0.05}
                  value={measuredNumberValue ?? 12.8}
                  onChange={(event) => {
                    const numeric = Number(event.target.value);
                    if (Number.isFinite(numeric)) {
                      void setNumberLike(numeric);
                    }
                  }}
                  disabled={isLocked}
                />
                <div className="preset-row">
                  {[11.5, 12.0, 12.5, 13.0, 13.3].map((preset) => (
                    <button
                      key={`volt-${preset}`}
                      className="button secondary small"
                      type="button"
                      onClick={() => void setNumberLike(preset)}
                      disabled={isLocked}
                    >
                      {preset.toFixed(1)}V
                    </button>
                  ))}
                </div>
              </>
            ) : cameraStep ? (
              <>
                <div className="measurement-header">
                  <span className="label">Camera count</span>
                  <span className="value meter-value">{measuredCountValue ?? 0}</span>
                </div>
                <div className="camera-grid">
                  {[0, 1, 2, 3, 4, 5].map((count) => (
                    <button
                      key={`camera-${count}`}
                      className={`camera-btn ${(measuredCountValue ?? 0) === count ? "active" : ""}`}
                      type="button"
                      onClick={() => void setNumberLike(count)}
                      disabled={isLocked}
                    >
                      {count}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="measurement-header">
                  <span className="label">Measured count</span>
                  <span className="value meter-value">{measuredCountValue ?? 0}</span>
                </div>
                <div className="counter-stepper">
                  <button
                    className="button secondary small"
                    type="button"
                    onClick={() => void setNumberLike(Math.max(0, (measuredCountValue ?? 0) - 1))}
                    disabled={isLocked}
                  >
                    -1
                  </button>
                  <button
                    className="button secondary small"
                    type="button"
                    onClick={() => void setNumberLike((measuredCountValue ?? 0) + 1)}
                    disabled={isLocked}
                  >
                    +1
                  </button>
                  {step.min !== undefined ? (
                    <button
                      className="button secondary small"
                      type="button"
                      onClick={() => void setNumberLike(step.min ?? 0)}
                      disabled={isLocked}
                    >
                      Set {step.min}
                    </button>
                  ) : null}
                </div>
              </>
            )}
            <div className="label">{requirementText(step)}</div>
          </div>
        ) : null}

        <div className="decision-grid">
          <button
            className={`decision-btn pass ${currentResponse?.passed ? "active" : ""}`}
            type="button"
            onClick={() => void setDecision(true)}
            disabled={isLocked}
          >
            Pass
          </button>
          <button
            className={`decision-btn action ${currentResponse?.inProgress ? "active" : ""}`}
            type="button"
            onClick={() => void delayStep()}
            disabled={isLocked}
          >
            Delay
          </button>
        </div>

        <div className="step-nav">
          <button
            className="button secondary"
            type="button"
            onClick={() => setStepIndex((prev) => Math.max(0, prev - 1))}
            disabled={stepIndex === 0 || isLocked}
          >
            Previous Step
          </button>
          {undoState ? (
            <button className="button secondary" type="button" onClick={() => void undoLastAction()}>
              Undo Last Action
            </button>
          ) : null}
        </div>
      </section>

      {openActionCards.length > 0 ? (
        <section className="card action-queue">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h3>Delayed Queue</h3>
            <span className="pill queue">{openActionCards.length} OPEN</span>
          </div>
          <div className="action-list">
            {openActionCards.map((card) => (
              <article key={card.id} className="action-item">
                <div className="action-item-top">
                  <div className="action-step">{card.stepPrompt}</div>
                  <div className="label">{formatCardAge(card.createdAtIso)}</div>
                </div>
                <div className="action-note">{card.note}</div>
                <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
                  <button className="button small" type="button" onClick={() => void markActionCardFixed(card.id)}>
                    Mark Pass
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="card col">
        <h2>Finalize</h2>
        <div className="label">
          You can mark ready only when every step passes and delayed cards are resolved.
        </div>
        {openActionCards.length > 0 ? (
          <div className="inline-msg warn">Resolve {openActionCards.length} delayed card(s) before finalizing.</div>
        ) : null}
        {counts.unanswered > 0 ? (
          <div className="inline-msg warn">{counts.unanswered} checklist step(s) still unanswered.</div>
        ) : null}
        <button className="button" type="button" disabled={!canFinalize || isLocked} onClick={() => void markReady()}>
          Mark Match Ready
        </button>
        {message ? <div className="inline-msg ok">{message}</div> : null}
      </section>
    </div>
  );
}
