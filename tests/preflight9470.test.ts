import { describe, expect, test } from "vitest";

import { PRE_FLIGHT_9470_STEPS } from "../src/checklist/preflight9470";

describe("9470 preflight checklist definition", () => {
  test("contains all expected steps", () => {
    expect(PRE_FLIGHT_9470_STEPS).toHaveLength(38);
    expect(PRE_FLIGHT_9470_STEPS.every((step) => step.required)).toBe(true);
    expect(PRE_FLIGHT_9470_STEPS.every((step) => typeof step.category === "string" && step.category.trim().length > 0)).toBe(true);
  });

  test("battery voltage step enforces >13.0", () => {
    const battery = PRE_FLIGHT_9470_STEPS.find((step) => step.id === "cold-15");
    expect(battery).toBeDefined();
    expect(battery?.kind).toBe("number");
    expect((battery?.min ?? 0) > 13).toBe(true);
  });

  test("intake deploy counter requires at least 5", () => {
    const deploy = PRE_FLIGHT_9470_STEPS.find((step) => step.id === "hot-4");
    expect(deploy).toBeDefined();
    expect(deploy?.kind).toBe("counter");
    expect(deploy?.min).toBe(5);
  });

  test("camera checks use purpose-built count thresholds", () => {
    const robotCameras = PRE_FLIGHT_9470_STEPS.find((step) => step.id === "cold-6");
    const driverCameras = PRE_FLIGHT_9470_STEPS.find((step) => step.id === "hot-2");

    expect(robotCameras?.kind).toBe("counter");
    expect(robotCameras?.min).toBe(3);
    expect(driverCameras?.kind).toBe("counter");
    expect(driverCameras?.min).toBe(2);
  });
});
