"use client";

import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { useParams } from "next/navigation";

import {
  SWIPE_EDGE_GUTTER_PX,
  classifySwipeDecision
} from "@/src/checklist/gesture";
import {
  computeRunState,
  isResponseComplete,
  isResponseNavigable,
  isStepPassing
} from "@/src/checklist/evaluation";
import { PRE_FLIGHT_9470_STEPS } from "@/src/checklist/preflight9470";
import { queueCountdown } from "@/src/matches/pitFlow";
import { getMatchesSnapshot, getRun, getSettings, saveMatchesSnapshot, saveRun } from "@/src/storage/localDb";
import type {
  AppSettings,
  ChecklistStep,
  MatchCard,
  MatchesPayload,
  PreflightActionCard,
  PreflightRun,
  StepResponse
} from "@/src/types/domain";

const SWIPE_COACHMARK_STORAGE_KEY = "ui:9470-preflight-swipe-coachmark-dismissed";
const FIRST_BOOLEAN_STEP_ID = PRE_FLIGHT_9470_STEPS.find((item) => item.kind === "boolean")?.id ?? "";

type UndoState = {
  run: PreflightRun;
  stepIndex: number;
  label: string;
};

type StepCounts = {
  passed: number;
  overridden: number;
  inProgress: number;
  blocked: number;
  unanswered: number;
};

type PreflightHeaderProps = {
  matchContext: MatchCard | null;
  matchSubtitle: string;
  matchTitle: string;
  progressPercent: number;
  stepIndex: number;
  counts: StepCounts;
  delayedCount: number;
  fallbackLabel: string;
};

type MeasurementPanelProps = {
  step: ChecklistStep;
  currentResponse: StepResponse | undefined;
  isLocked: boolean;
  onSetNumberLike: (value: number) => void | Promise<void>;
};

type SwipeDecisionCardProps = {
  step: ChecklistStep;
  stepIndex: number;
  totalSteps: number;
  currentResponse: StepResponse | undefined;
  canPass: boolean;
  isLocked: boolean;
  showCoachmark: boolean;
  onDismissCoachmark: () => void;
  onPass: () => void | Promise<void>;
  onDelay: () => void | Promise<void>;
  children?: ReactNode;
};

type DelayedStackProps = {
  cards: PreflightActionCard[];
  isLocked: boolean;
  currentStepId: string;
  onMarkActionCardFixed: (cardId: string) => void | Promise<void>;
};

type SwipeShellProps = {
  canSwipe: boolean;
  allowDelay?: boolean;
  passLabel?: string;
  delayLabel?: string;
  resetKey: string;
  onPass: () => void | Promise<void>;
  onDelay?: () => void | Promise<void>;
  footer?: ReactNode;
  className?: string;
  children: ReactNode;
};

type ReadyFooterProps = {
  canFinalize: boolean;
  counts: StepCounts;
  isLocked: boolean;
  message: string | null;
  openActionCardCount: number;
  onMarkReady: () => void | Promise<void>;
};

type SwipePreview = "idle" | "pass" | "delay";

type SwipeTrackingState = {
  allowSwipe: boolean;
  captured: boolean;
  pointerId: number;
  startX: number;
  startY: number;
  viewportWidth: number;
};

type SwipeGestureOptions = {
  canSwipe: boolean;
  allowDelay?: boolean;
  onPass: () => void | Promise<void>;
  onDelay?: () => void | Promise<void>;
  resetKey: string;
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

function formatTime(iso: string | null): string {
  if (!iso) {
    return "TBD";
  }
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function statCounts(responses: StepResponse[]): StepCounts {
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

function opposingAllianceColor(color: MatchCard["allianceColor"]): "red" | "blue" | "unknown" {
  if (color === "red") {
    return "blue";
  }
  if (color === "blue") {
    return "red";
  }
  return "unknown";
}

function isBatteryBeakStep(step: ChecklistStep): boolean {
  return step.id === "cold-15";
}

function isPdhVoltageStep(step: ChecklistStep): boolean {
  return step.id === "hot-7";
}

function isCameraCountStep(step: ChecklistStep): boolean {
  return step.id === "hot-2";
}

function requirementText(step: ChecklistStep): string {
  if (step.kind === "number") {
    if (isBatteryBeakStep(step)) {
      return `Requirement: value >= ${Math.round(step.min ?? 0)}% on Battery Beak`;
    }
    return `Requirement: value >= ${Number(step.min ?? 0).toFixed(1)}V`;
  }
  if (step.kind === "counter") {
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
  const numberStepDelta = min >= 20 ? 1 : 0.1;

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

    const passingValue = entered !== undefined && entered >= min ? entered : min;
    const failingValue = entered !== undefined && entered < min ? entered : Math.max(0, min - numberStepDelta);

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

function readyFooterStatusText(
  canFinalize: boolean,
  counts: StepCounts,
  isLocked: boolean,
  openActionCardCount: number
): string {
  if (isLocked) {
    return "Match is already marked ready.";
  }
  if (openActionCardCount > 0) {
    return openActionCardCount === 1
      ? "1 delayed item still needs a pass."
      : `${openActionCardCount} delayed items still need a pass.`;
  }
  if (counts.unanswered > 0) {
    return counts.unanswered === 1
      ? "1 checklist step is still unanswered."
      : `${counts.unanswered} checklist steps are still unanswered.`;
  }
  if (counts.blocked > 0) {
    return counts.blocked === 1
      ? "1 checklist step still needs a pass or delay."
      : `${counts.blocked} checklist steps still need a pass or delay.`;
  }
  if (canFinalize) {
    return "All checklist steps are clear. Match can be marked ready.";
  }
  return "Continue the checklist to clear remaining blockers.";
}

function readyFooterSummary(counts: StepCounts, isLocked: boolean, openActionCardCount: number): string {
  if (isLocked) {
    return "Match ready";
  }
  if (openActionCardCount > 0) {
    return openActionCardCount === 1 ? "1 delayed" : `${openActionCardCount} delayed`;
  }
  if (counts.unanswered > 0) {
    return counts.unanswered === 1 ? "1 left" : `${counts.unanswered} left`;
  }
  if (counts.blocked > 0) {
    return counts.blocked === 1 ? "1 blocked" : `${counts.blocked} blocked`;
  }
  return "All clear";
}

function canPassCurrentStep(step: ChecklistStep, response: StepResponse | undefined): boolean {
  if (step.kind === "boolean") {
    return true;
  }
  return Boolean(response?.passed);
}

function PreflightHeader({
  matchContext,
  matchSubtitle,
  matchTitle,
  progressPercent,
  stepIndex,
  counts,
  delayedCount,
  fallbackLabel
}: PreflightHeaderProps): React.JSX.Element {
  return (
    <section className="card preflight-header-card">
      <div className="preflight-header-copy">
        <div className="preflight-header-title-row">
          <h1 className="preflight-title">{matchTitle}</h1>
        </div>

        {matchContext ? (
          <>
            <div className="preflight-timing-line">
              <span className="preflight-timing-label">QUEUE</span>
              <span className="preflight-timing-value">{formatTime(matchContext.queueTimeIso)}</span>
              <span className="preflight-timing-label">MATCH</span>
              <span className="preflight-timing-value">{formatTime(matchContext.expectedStartTimeIso)}</span>
              <span className="preflight-timing-divider">|</span>
              <span className="preflight-timing-countdown">{matchSubtitle}</span>
            </div>
            <div className="team-rows compact">
              <div className="team-row">
                <span className="team-side">ALLY</span>
                <span className={`team-values alliance ${matchContext.allianceColor}`}>{matchContext.allianceTeams.join(" • ")}</span>
              </div>
              <div className="team-row">
                <span className="team-side">OPP</span>
                <span className={`team-values alliance ${opposingAllianceColor(matchContext.allianceColor)}`}>
                  {matchContext.opponentTeams.join(" • ")}
                </span>
              </div>
            </div>
          </>
        ) : (
          <div className="label">{fallbackLabel}</div>
        )}
      </div>

      <div className="progress-block">
        <div className="progress-meta compact">
          <span className="value progress-percent">{progressPercent}%</span>
          <span className="label">Step {stepIndex + 1} / {PRE_FLIGHT_9470_STEPS.length}</span>
          {counts.unanswered > 0 ? <span className="label">{counts.unanswered} left</span> : null}
          {counts.unanswered === 0 && delayedCount === 0 ? <span className="label">All clear</span> : null}
        </div>
        <div className="progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressPercent}>
          <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
        </div>
      </div>
    </section>
  );
}

function MeasurementPanel({
  step,
  currentResponse,
  isLocked,
  onSetNumberLike
}: MeasurementPanelProps): React.JSX.Element | null {
  if (step.kind === "boolean") {
    return null;
  }

  const batteryBeakStep = isBatteryBeakStep(step);
  const pdhVoltageStep = isPdhVoltageStep(step);
  const cameraStep = isCameraCountStep(step);
  const measuredNumberValue =
    step.kind === "number" && typeof currentResponse?.valueNumber === "number"
      ? currentResponse.valueNumber
      : batteryBeakStep ? 130 : 13.0;
  const measuredCountValue =
    step.kind === "counter" && typeof currentResponse?.valueCount === "number"
      ? currentResponse.valueCount
      : 0;
  const passing = Boolean(currentResponse?.passed);
  const target = step.min ?? 0;
  const progressDots =
    !cameraStep && step.kind === "counter" && target > 0 && target <= 8
      ? Array.from({ length: target }, (_, index) => index < measuredCountValue)
      : [];

  if (batteryBeakStep) {
    return (
      <div className="measurement-panel battery-panel">
        <div className="measurement-header">
          <span className="label">Battery Beak</span>
          <span className={`measurement-status ${passing ? "met" : ""}`}>
            {passing ? "Requirement met" : `Need ${Math.round(step.min ?? 0)}%+`}
          </span>
        </div>
        <div className="measurement-hero">
          <span className="measurement-hero-value">{Math.round(measuredNumberValue)}%</span>
        </div>
        <input
          className="battery-range"
          type="range"
          min={115}
          max={140}
          step={1}
          value={Math.round(measuredNumberValue)}
          onChange={(event) => {
            const numeric = Number(event.target.value);
            if (Number.isFinite(numeric)) {
              void onSetNumberLike(numeric);
            }
          }}
          disabled={isLocked}
        />
        <div className="preset-row">
          {[120, 125, 130, 135, 140].map((preset) => (
            <button
              key={`beak-${preset}`}
              className={`measure-chip ${Math.round(measuredNumberValue) === preset ? "active" : ""}`}
              type="button"
              onClick={() => void onSetNumberLike(preset)}
              disabled={isLocked}
            >
              {preset}%
            </button>
          ))}
        </div>
        <div className="measurement-hint">{requirementText(step)}. Set a passing value, then tap Pass.</div>
      </div>
    );
  }

  if (pdhVoltageStep) {
    return (
      <div className="measurement-panel battery-panel">
        <div className="measurement-header">
          <span className="label">PDH voltage</span>
          <span className={`measurement-status ${passing ? "met" : ""}`}>
            {passing ? "Requirement met" : `Need ${Number(step.min ?? 0).toFixed(1)}V+`}
          </span>
        </div>
        <div className="measurement-hero">
          <span className="measurement-hero-value">{measuredNumberValue.toFixed(2)}V</span>
        </div>
        <input
          className="battery-range"
          type="range"
          min={11}
          max={14}
          step={0.05}
          value={measuredNumberValue}
          onChange={(event) => {
            const numeric = Number(event.target.value);
            if (Number.isFinite(numeric)) {
              void onSetNumberLike(numeric);
            }
          }}
          disabled={isLocked}
        />
        <div className="preset-row">
          {[12.0, 12.5, 13.0, 13.2, 13.5].map((preset) => (
            <button
              key={`volt-${preset}`}
              className={`measure-chip ${measuredNumberValue === preset ? "active" : ""}`}
              type="button"
              onClick={() => void onSetNumberLike(preset)}
              disabled={isLocked}
            >
              {preset.toFixed(1)}V
            </button>
          ))}
        </div>
        <div className="measurement-hint">{requirementText(step)}. Set a passing value, then tap Pass.</div>
      </div>
    );
  }

  if (cameraStep) {
    return (
      <div className="measurement-panel">
        <div className="measurement-header">
          <span className="label">Camera count</span>
          <span className={`measurement-status ${passing ? "met" : ""}`}>
            {passing ? "Requirement met" : `Need ${target}+ cameras`}
          </span>
        </div>
        <div className="measurement-hero compact">
          <span className="measurement-hero-value">{measuredCountValue}</span>
          <span className="measurement-hero-subvalue">selected</span>
        </div>
        <div className="camera-grid large">
          {[0, 1, 2, 3, 4, 5].map((count) => (
            <button
              key={`camera-${count}`}
              className={`camera-btn ${(measuredCountValue ?? 0) === count ? "active" : ""}`}
              type="button"
              onClick={() => void onSetNumberLike(count)}
              disabled={isLocked}
            >
              {count}
            </button>
          ))}
        </div>
        <div className="measurement-hint">{requirementText(step)}. Set a passing value, then tap Pass.</div>
      </div>
    );
  }

  return (
    <div className="measurement-panel count-panel">
      <div className="measurement-header">
        <span className="label">Cycle count</span>
        <span className={`measurement-status ${passing ? "met" : ""}`}>
          {passing ? "Requirement met" : `Target ${target}`}
        </span>
      </div>
      <div className="measurement-hero">
        <span className="measurement-hero-value">{measuredCountValue}</span>
        <span className="measurement-hero-subvalue">{target > 0 ? `of ${target} needed` : "counted"}</span>
      </div>
      {progressDots.length > 0 ? (
        <div className="count-progress" aria-hidden="true">
          {progressDots.map((filled, index) => (
            <span key={`${step.id}-dot-${index}`} className={`count-progress-dot ${filled ? "filled" : ""}`} />
          ))}
        </div>
      ) : null}
      <div className="counter-stepper large">
        <button
          className="measure-action"
          type="button"
          onClick={() => void onSetNumberLike(Math.max(0, measuredCountValue - 1))}
          disabled={isLocked}
        >
          -1
        </button>
        <button
          className="measure-action primary"
          type="button"
          onClick={() => void onSetNumberLike(measuredCountValue + 1)}
          disabled={isLocked}
        >
          +1
        </button>
        {target > 0 ? (
          <button
            className="measure-action"
            type="button"
            onClick={() => void onSetNumberLike(target)}
            disabled={isLocked}
          >
            Set {target}
          </button>
        ) : null}
      </div>
      <div className="measurement-hint">{requirementText(step)}. Set a passing value, then tap Pass.</div>
    </div>
  );
}

function useSwipeCardGesture({
  canSwipe,
  allowDelay = true,
  onPass,
  onDelay,
  resetKey
}: SwipeGestureOptions): {
  cardRef: React.RefObject<HTMLDivElement>;
  dragging: boolean;
  preview: SwipePreview;
  swipeVisualStyle: CSSProperties | undefined;
  transformStyle: CSSProperties | undefined;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerCancel: (event: ReactPointerEvent<HTMLDivElement>) => void;
} {
  const cardRef = useRef<HTMLDivElement>(null);
  const swipeState = useRef<SwipeTrackingState | null>(null);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<SwipePreview>("idle");
  const passReveal = dragX > 0 ? Math.min(1, Math.abs(dragX) / 112) : 0;
  const delayReveal = allowDelay && dragX < 0 ? Math.min(1, Math.abs(dragX) / 112) : 0;
  const swipeVisualStyle = canSwipe
    ? ({
        "--pass-reveal": passReveal.toString(),
        "--delay-reveal": delayReveal.toString()
      } as CSSProperties)
    : undefined;

  const resetSwipe = (): void => {
    swipeState.current = null;
    setDragX(0);
    setDragging(false);
    setPreview("idle");
  };

  useEffect(() => {
    resetSwipe();
  }, [resetKey, canSwipe]);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (!canSwipe || !event.isPrimary) {
      return;
    }

    swipeState.current = {
      allowSwipe:
        event.clientX > SWIPE_EDGE_GUTTER_PX &&
        event.clientX < window.innerWidth - SWIPE_EDGE_GUTTER_PX,
      captured: false,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      viewportWidth: window.innerWidth
    };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const active = swipeState.current;
    if (!active || active.pointerId !== event.pointerId || !active.allowSwipe) {
      return;
    }

    const dx = event.clientX - active.startX;
    const dy = event.clientY - active.startY;

    if (Math.abs(dy) > Math.abs(dx) * 1.4 && Math.abs(dy) > 10) {
      setDragX(0);
      setDragging(false);
      setPreview("idle");
      return;
    }

    if (Math.abs(dx) < 5) {
      setDragX(0);
      setPreview("idle");
      return;
    }

    const cardWidth = cardRef.current?.getBoundingClientRect().width ?? 320;
    const maxDrag = cardWidth * 0.42;
    const nextDrag = Math.max(-maxDrag, Math.min(maxDrag, dx));

    if (!active.captured) {
      active.captured = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }

    setDragging(true);
    setDragX(nextDrag);
    setPreview(nextDrag > 16 ? "pass" : allowDelay && nextDrag < -16 ? "delay" : "idle");
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const active = swipeState.current;
    if (!active || active.pointerId !== event.pointerId) {
      return;
    }

    if (active.captured && event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (!active.captured) {
      swipeState.current = null;
      return;
    }

    const decision = active.allowSwipe
      ? classifySwipeDecision({
          dx: event.clientX - active.startX,
          dy: event.clientY - active.startY,
          cardWidth: cardRef.current?.getBoundingClientRect().width ?? 320,
          startClientX: active.startX,
          viewportWidth: active.viewportWidth
        })
      : null;

    resetSwipe();

    if (decision === "pass") {
      void onPass();
      return;
    }
    if (decision === "delay" && allowDelay && onDelay) {
      void onDelay();
    }
  };

  return {
    cardRef,
    dragging,
    preview,
    swipeVisualStyle,
    transformStyle: canSwipe ? { transform: `translateX(${dragX}px)` } : undefined,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel: onPointerUp
  };
}

function SwipeShellCard({
  canSwipe,
  allowDelay = true,
  passLabel = "Pass",
  delayLabel = "Delay",
  resetKey,
  onPass,
  onDelay,
  footer,
  className,
  children
}: SwipeShellProps): React.JSX.Element {
  const swipe = useSwipeCardGesture({ canSwipe, allowDelay, onPass, onDelay, resetKey });

  return (
    <section
      className={`card step-card swipe-card ${swipe.preview !== "idle" ? `preview-${swipe.preview}` : ""}${className ? ` ${className}` : ""}`}
      style={swipe.swipeVisualStyle}
    >
      {canSwipe ? (
        <div className={`swipe-lane ${allowDelay ? "" : "pass-only"}`.trim()} aria-hidden="true">
          <span className="swipe-lane-label pass">{passLabel}</span>
          {allowDelay ? <span className="swipe-lane-label delay">{delayLabel}</span> : null}
        </div>
      ) : null}

      <div
        ref={swipe.cardRef}
        className={`swipe-card-panel ${swipe.dragging ? "dragging" : ""}`}
        onPointerDown={swipe.onPointerDown}
        onPointerMove={swipe.onPointerMove}
        onPointerUp={swipe.onPointerUp}
        onPointerCancel={swipe.onPointerCancel}
        style={swipe.transformStyle}
      >
        <div className="swipe-card-body">{children}</div>
        {footer}
      </div>
    </section>
  );
}

function SwipeDecisionCard({
  step,
  stepIndex,
  totalSteps,
  currentResponse,
  canPass,
  isLocked,
  showCoachmark,
  onDismissCoachmark,
  onPass,
  onDelay,
  children
}: SwipeDecisionCardProps): React.JSX.Element {
  return (
    <SwipeShellCard
      canSwipe={step.kind === "boolean" && !isLocked}
      allowDelay
      resetKey={`${step.id}:${isLocked}`}
      onPass={onPass}
      onDelay={onDelay}
      footer={
        <div className="decision-grid">
          <button
            className={`decision-btn pass ${currentResponse?.passed ? "active" : ""}`}
            type="button"
            onClick={() => void onPass()}
            disabled={isLocked || !canPass}
          >
            Pass
          </button>
          <button
            className={`decision-btn action ${currentResponse?.inProgress ? "active" : ""}`}
            type="button"
            onClick={() => void onDelay()}
            disabled={isLocked}
          >
            Delay
          </button>
        </div>
      }
    >
      <div className="step-title-row">
        <div className="step-kicker">Step {stepIndex + 1} of {totalSteps}</div>
        {currentResponse?.inProgress ? <span className="pill queue">Delayed</span> : null}
      </div>
      <div className="step-subcategory">{step.category ?? "General"}</div>
      <h2 className="step-prompt">{step.prompt}</h2>

      {showCoachmark ? (
        <div className="swipe-coachmark" role="note">
          <div>Swipe right to pass, left to delay. Buttons still work.</div>
          <button
            className="button secondary small"
            type="button"
            onClick={onDismissCoachmark}
            onPointerDown={(event) => event.stopPropagation()}
            onPointerUp={(event) => event.stopPropagation()}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {children}
    </SwipeShellCard>
  );
}

function DelayedItemsStack({
  cards,
  isLocked,
  currentStepId,
  onMarkActionCardFixed,
}: DelayedStackProps): React.JSX.Element | null {
  const visibleCards = cards.filter((card) => card.stepId !== currentStepId);

  if (visibleCards.length === 0) {
    return null;
  }

  return (
    <section className="delayed-stack" aria-label="Delayed items">
      <div className="delayed-stack-heading">
        <span className="step-kicker">Delayed items</span>
        <span className="label">
          {visibleCards.length === 1 ? "1 waiting on a fix" : `${visibleCards.length} waiting on fixes`}
        </span>
      </div>

      <div className="delayed-stack-list">
        {visibleCards.map((card) => {
          const step = getStepById(card.stepId);
          if (!step) {
            return null;
          }

          return (
            <SwipeShellCard
              key={card.id}
              canSwipe={!isLocked}
              allowDelay={false}
              resetKey={`${card.id}:${card.status}:${isLocked}`}
              onPass={() => onMarkActionCardFixed(card.id)}
              className="delayed-step-card"
            >
              <div className="step-title-row">
                <div className="step-kicker">Delayed item</div>
                <div className="label">{formatCardAge(card.createdAtIso)}</div>
              </div>
              <div className="step-subcategory">{step.category ?? "General"}</div>
              <h2 className="step-prompt delayed-step-prompt">{card.stepPrompt}</h2>
              {step.kind !== "boolean" ? <div className="label delayed-step-requirement">{requirementText(step)}</div> : null}
            </SwipeShellCard>
          );
        })}
      </div>
    </section>
  );
}

function ReadyFooter({
  canFinalize,
  counts,
  isLocked,
  message,
  openActionCardCount,
  onMarkReady
}: ReadyFooterProps): React.JSX.Element {
  return (
    <section className="card ready-footer">
      <div className="ready-footer-bar">
        <div className="ready-footer-copy">
          <div className="step-kicker">Ready check</div>
          <div className="ready-footer-title">{readyFooterSummary(counts, isLocked, openActionCardCount)}</div>
          <div className="label">{readyFooterStatusText(canFinalize, counts, isLocked, openActionCardCount)}</div>
        </div>
        <div className="ready-footer-actions">
          <button className="button" type="button" disabled={!canFinalize || isLocked} onClick={() => void onMarkReady()}>
            {isLocked ? "Match Ready" : "Mark Match Ready"}
          </button>
        </div>
      </div>
      {message ? (
        <div className="inline-msg ok ready-footer-message" aria-live="polite">
          {message}
        </div>
      ) : null}
    </section>
  );
}

export default function PreflightPage(): React.JSX.Element {
  const params = useParams<{ matchKey: string }>();
  const rawMatchKey = params.matchKey;
  const matchKey = decodeURIComponent(Array.isArray(rawMatchKey) ? rawMatchKey[0] : rawMatchKey ?? "");

  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [matchContext, setMatchContext] = useState<MatchCard | null>(null);
  const [run, setRun] = useState<PreflightRun | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [undoState, setUndoState] = useState<UndoState | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [swipeCoachmarkDismissed, setSwipeCoachmarkDismissed] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async (): Promise<void> => {
      setInitialized(false);
      setMessage(null);

      const appSettings = await getSettings();
      if (cancelled) {
        return;
      }
      setSettings(appSettings);

      if (!appSettings.eventKey) {
        setMatchContext(null);
        setRun(null);
        setUndoState(null);
        setInitialized(true);
        return;
      }

      const snapshot = await getMatchesSnapshot(appSettings.eventKey, appSettings.teamNumber);
      if (!cancelled) {
        const snapshotMatch = snapshot?.matches.find((item) => item.matchKey === matchKey) ?? null;
        setMatchContext(snapshotMatch);
      }

      const modeParam = appSettings.dataMode === "mock" ? "&mode=mock" : "";
      fetch(
        `/api/matches?team=${encodeURIComponent(String(appSettings.teamNumber))}&event=${encodeURIComponent(appSettings.eventKey)}&leadMinutes=${encodeURIComponent(String(appSettings.queueLeadMinutes))}${modeParam}`,
        { cache: "no-store" }
      )
        .then(async (res) => {
          if (!res.ok) {
            throw new Error(`API request failed with ${res.status}`);
          }
          return (await res.json()) as MatchesPayload;
        })
        .then(async (payload) => {
          if (cancelled) {
            return;
          }
          const currentMatch = payload.matches.find((item) => item.matchKey === matchKey) ?? null;
          setMatchContext(currentMatch);
          await saveMatchesSnapshot(appSettings.eventKey, appSettings.teamNumber, payload);
        })
        .catch(() => {
          // Snapshot context is enough for checklist flow.
        });

      const existing = await getRun(appSettings.eventKey, matchKey);
      if (cancelled) {
        return;
      }

      if (existing) {
        const migrated = migrateLegacyFailedSteps(existing);
        if (migrated.migrated) {
          await saveRun(migrated.run);
        }
        if (cancelled) {
          return;
        }
        setRun(migrated.run);
        setUndoState(null);
        setStepIndex(firstIncompleteIndex(migrated.run));
        setInitialized(true);
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
      if (cancelled) {
        return;
      }
      setRun(fresh);
      setUndoState(null);
      setStepIndex(0);
      setInitialized(true);
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [matchKey]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      setSwipeCoachmarkDismissed(localStorage.getItem(SWIPE_COACHMARK_STORAGE_KEY) === "1");
    } catch {
      setSwipeCoachmarkDismissed(false);
    }
  }, []);

  const step = PRE_FLIGHT_9470_STEPS[stepIndex];
  const currentResponse = run && step ? getResponse(run, step.id) : undefined;
  const openActionCards = useMemo(
    () =>
      [...(run?.actionCards ?? [])]
        .filter((card) => card.status === "OPEN")
        .sort((left, right) => new Date(right.createdAtIso).getTime() - new Date(left.createdAtIso).getTime()),
    [run?.actionCards]
  );
  const counts = useMemo(() => statCounts(run?.responses ?? []), [run?.responses]);
  const isLocked = run?.state === "READY";

  const traversedSteps = useMemo(
    () => PRE_FLIGHT_9470_STEPS.filter((item) => isResponseNavigable(getResponse(run, item.id))).length,
    [run]
  );

  const progressPercent = Math.round((traversedSteps / PRE_FLIGHT_9470_STEPS.length) * 100);

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

  const markReady = async (): Promise<void> => {
    if (!run || isLocked) {
      return;
    }

    const allComplete = PRE_FLIGHT_9470_STEPS.every((item) => isResponseComplete(getResponse(run, item.id)));
    const canFinalize = allComplete && openActionCards.length === 0;
    if (!canFinalize) {
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

  const dismissSwipeCoachmark = (): void => {
    setSwipeCoachmarkDismissed(true);
    try {
      localStorage.setItem(SWIPE_COACHMARK_STORAGE_KEY, "1");
    } catch {
      // localStorage is a best-effort preference cache only.
    }
  };

  if (!initialized || !settings) {
    return <div className="card">Loading preflight run...</div>;
  }

  if (!settings.eventKey) {
    return <div className="card">Set event key in Settings before running preflight.</div>;
  }

  if (!run || !step) {
    return <div className="card">Loading preflight run...</div>;
  }

  const allComplete = PRE_FLIGHT_9470_STEPS.every((item) => isResponseComplete(getResponse(run, item.id)));
  const canFinalize = allComplete && openActionCards.length === 0;
  const matchTitle = matchContext ? `${matchContext.compLevel.toUpperCase()} ${matchContext.matchNumber} Preflight` : "Preflight";
  const matchSubtitle = matchContext ? queueCountdown(matchContext.queueTimeIso) : settings.eventKey;
  const showCoachmark =
    swipeCoachmarkDismissed === false && step.kind === "boolean" && step.id === FIRST_BOOLEAN_STEP_ID;

  return (
    <div className="preflight-shell">
      <PreflightHeader
        matchContext={matchContext}
        matchSubtitle={matchSubtitle}
        matchTitle={matchTitle}
        progressPercent={progressPercent}
        stepIndex={stepIndex}
        counts={counts}
        delayedCount={openActionCards.length}
        fallbackLabel={`${settings.eventKey} • ${matchKey}`}
      />

      <SwipeDecisionCard
        step={step}
        stepIndex={stepIndex}
        totalSteps={PRE_FLIGHT_9470_STEPS.length}
        currentResponse={currentResponse}
        canPass={canPassCurrentStep(step, currentResponse)}
        isLocked={isLocked}
        showCoachmark={showCoachmark}
        onDismissCoachmark={dismissSwipeCoachmark}
        onPass={() => setDecision(true)}
        onDelay={delayStep}
      >
        <MeasurementPanel
          step={step}
          currentResponse={currentResponse}
          isLocked={isLocked}
          onSetNumberLike={setNumberLike}
        />
      </SwipeDecisionCard>

      <DelayedItemsStack
        cards={openActionCards}
        isLocked={isLocked}
        currentStepId={step.id}
        onMarkActionCardFixed={markActionCardFixed}
      />

      <div className="step-nav-inline">
        <button
          className="button secondary small step-nav-button"
          type="button"
          onClick={() => setStepIndex((prev) => Math.max(0, prev - 1))}
          disabled={stepIndex === 0 || isLocked}
        >
          Previous Step
        </button>
        {undoState ? (
          <button className="button secondary small step-nav-button" type="button" onClick={() => void undoLastAction()}>
            Undo Last Action
          </button>
        ) : null}
      </div>

      <ReadyFooter
        canFinalize={canFinalize}
        counts={counts}
        isLocked={isLocked}
        message={message}
        openActionCardCount={openActionCards.length}
        onMarkReady={markReady}
      />
    </div>
  );
}
