import { describe, expect, test } from "vitest";

import { PRE_FLIGHT_9470_STEPS, PRE_FLIGHT_STEP_COUNT } from "../src/checklist/preflight9470";

describe("9470 preflight checklist definition", () => {
  test("contains all expected steps", () => {
    expect(PRE_FLIGHT_9470_STEPS).toHaveLength(21);
    expect(PRE_FLIGHT_STEP_COUNT).toBe(21);
    expect(PRE_FLIGHT_9470_STEPS.every((step) => step.required)).toBe(true);
    expect(PRE_FLIGHT_9470_STEPS.every((step) => typeof step.category === "string" && step.category.trim().length > 0)).toBe(true);
  });

  test("battery beak cold check requires at least 130 percent", () => {
    const batteryBeak = PRE_FLIGHT_9470_STEPS.find((step) => step.id === "cold-15");
    expect(batteryBeak).toBeDefined();
    expect(batteryBeak?.kind).toBe("number");
    expect(batteryBeak?.min).toBe(130);
  });

  test("pdh voltage hot check requires at least 13.0 volts", () => {
    const pdhVoltage = PRE_FLIGHT_9470_STEPS.find((step) => step.id === "hot-7");
    expect(pdhVoltage).toBeDefined();
    expect(pdhVoltage?.kind).toBe("number");
    expect(pdhVoltage?.min).toBe(13);
  });

  test("intake deploy counter requires at least 5", () => {
    const deploy = PRE_FLIGHT_9470_STEPS.find((step) => step.id === "hot-4");
    expect(deploy).toBeDefined();
    expect(deploy?.kind).toBe("counter");
    expect(deploy?.min).toBe(5);
  });

  test("driver station camera check requires at least two cameras", () => {
    const driverCameras = PRE_FLIGHT_9470_STEPS.find((step) => step.id === "hot-2");

    expect(driverCameras?.kind).toBe("counter");
    expect(driverCameras?.min).toBe(2);
  });
});
