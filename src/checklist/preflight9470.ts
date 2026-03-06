import type { ChecklistStep } from "@/src/types/domain";

export const PRE_FLIGHT_9470_STEPS: ChecklistStep[] = [
  {
    id: "cold-1",
    section: "cold",
    category: "Hopper",
    prompt: "Verify hopper screws are tight and Loctite is applied",
    kind: "boolean",
    required: true
  },
  {
    id: "cold-1a",
    section: "cold",
    category: "Hopper",
    prompt: "Inspect hopper pulleys for cracks or damage",
    kind: "boolean",
    required: true
  },
  {
    id: "cold-2",
    section: "cold",
    category: "Hopper",
    prompt: "Confirm hopper divider zip ties are secure",
    kind: "boolean",
    required: true
  },
  {
    id: "cold-3",
    section: "cold",
    category: "Intake",
    prompt: "Verify intake screws on churros and hex shafts are tight",
    kind: "boolean",
    required: true
  },
  {
    id: "cold-3a",
    section: "cold",
    category: "Intake",
    prompt: "Inspect intake bearings and motor screws",
    kind: "boolean",
    required: true
  },
  {
    id: "cold-4",
    section: "cold",
    category: "Intake",
    prompt: "Check intake turnbuckles are tight",
    kind: "boolean",
    required: true
  },
  {
    id: "cold-4a",
    section: "cold",
    category: "Intake",
    prompt: "Confirm intake chain is aligned",
    kind: "boolean",
    required: true
  },
  {
    id: "cold-5",
    section: "cold",
    category: "Structure",
    prompt: "Inspect intake and hopper walls for cracks",
    kind: "boolean",
    required: true
  },
  {
    id: "cold-6",
    section: "cold",
    category: "Vision",
    prompt: "Cameras detected on robot (count)",
    kind: "counter",
    required: true,
    min: 3
  },
  {
    id: "cold-7",
    section: "cold",
    category: "Drivetrain",
    prompt: "Verify drivetrain screws are tight",
    kind: "boolean",
    required: true
  },
  {
    id: "cold-7a",
    section: "cold",
    category: "Drivetrain",
    prompt: "Inspect swerve wheels and module fasteners",
    kind: "boolean",
    required: true
  },
  {
    id: "cold-7b",
    section: "cold",
    category: "Drivetrain",
    prompt: "Inspect belly pan and sled fasteners",
    kind: "boolean",
    required: true
  },
  {
    id: "cold-8",
    section: "cold",
    category: "Drivetrain",
    prompt: "Check wheel treads for excessive wear",
    kind: "boolean",
    required: true
  },
  {
    id: "cold-9",
    section: "cold",
    category: "Shooter",
    prompt: "Verify shooter screws are tight",
    kind: "boolean",
    required: true
  },
  {
    id: "cold-9a",
    section: "cold",
    category: "Shooter",
    prompt: "Inspect hood, mount, motor, and shaft screws",
    kind: "boolean",
    required: true
  },
  {
    id: "cold-9b",
    section: "cold",
    category: "Shooter",
    prompt: "Confirm shooter gear rack is aligned",
    kind: "boolean",
    required: true
  },
  {
    id: "cold-10",
    section: "cold",
    category: "Wiring",
    prompt: "Confirm wires are clear with no protrusions",
    kind: "boolean",
    required: true
  },
  {
    id: "cold-10a",
    section: "cold",
    category: "Wiring",
    prompt: "Perform a wire tug test",
    kind: "boolean",
    required: true
  },
  {
    id: "cold-11",
    section: "cold",
    category: "Main Power",
    prompt: "Verify main breaker is secure and tight",
    kind: "boolean",
    required: true
  },
  {
    id: "cold-11a",
    section: "cold",
    category: "Main Power",
    prompt: "Check breaker lugs are tight; no crack and no wiggle",
    kind: "boolean",
    required: true
  },
  {
    id: "cold-12",
    section: "cold",
    category: "Battery",
    prompt: "Confirm battery connector (SB50/Anderson) is fully seated",
    kind: "boolean",
    required: true
  },
  {
    id: "cold-12a",
    section: "cold",
    category: "Battery",
    prompt: "Inspect connector pins and check for heat discoloration",
    kind: "boolean",
    required: true
  },
  {
    id: "cold-13",
    section: "cold",
    category: "Network",
    prompt: "Confirm Ethernet (RIO to radio) is fully latched",
    kind: "boolean",
    required: true
  },
  {
    id: "cold-13a",
    section: "cold",
    category: "Network",
    prompt: "Check cable routing (no sharp bends) and radio power retention",
    kind: "boolean",
    required: true
  },
  {
    id: "cold-14",
    section: "cold",
    category: "Bumpers",
    prompt: "Verify bumpers are mounted and tight",
    kind: "boolean",
    required: true
  },
  {
    id: "cold-14a",
    section: "cold",
    category: "Bumpers",
    prompt: "Confirm bumper screws are tight and all nuts are present",
    kind: "boolean",
    required: true
  },
  {
    id: "cold-15",
    section: "cold",
    category: "Battery",
    prompt: "Battery voltage reading",
    kind: "number",
    required: true,
    min: 13.000001
  },
  {
    id: "cold-15a",
    section: "cold",
    category: "Battery",
    prompt: "Confirm battery is secure and power cables are zip tied",
    kind: "boolean",
    required: true
  },
  {
    id: "hot-1",
    section: "hot",
    category: "Drivetrain",
    prompt: "Drive test: all swerve modules turn together",
    kind: "boolean",
    required: true
  },
  {
    id: "hot-2",
    section: "hot",
    category: "Vision",
    prompt: "Cameras online at driver station (count)",
    kind: "counter",
    required: true,
    min: 2
  },
  {
    id: "hot-3",
    section: "hot",
    category: "Electrical",
    prompt: "Verify RSL illuminates",
    kind: "boolean",
    required: true
  },
  {
    id: "hot-4",
    section: "hot",
    category: "Intake",
    prompt: "Cycle intake deploy/retract smoothly (count)",
    kind: "counter",
    required: true,
    min: 5
  },
  {
    id: "hot-4a",
    section: "hot",
    category: "Intake",
    prompt: "Test intake with and without hopper extended",
    kind: "boolean",
    required: true
  },
  {
    id: "hot-5",
    section: "hot",
    category: "Hopper",
    prompt: "Run hopper by itself",
    kind: "boolean",
    required: true
  },
  {
    id: "hot-5a",
    section: "hot",
    category: "Hopper",
    prompt: "Listen for bad sounds and inspect grip tape/pulley condition",
    kind: "boolean",
    required: true
  },
  {
    id: "hot-6",
    section: "hot",
    category: "Scoring",
    prompt: "Run one intake-to-hopper-to-shoot cycle",
    kind: "boolean",
    required: true
  },
  {
    id: "hot-6a",
    section: "hot",
    category: "Shooter",
    prompt: "Cycle each shooter chamber once",
    kind: "boolean",
    required: true
  },
  {
    id: "hot-7",
    section: "hot",
    category: "Driver Station",
    prompt: "Confirm laptop is charged and controller is connected",
    kind: "boolean",
    required: true
  }
];

export const PRE_FLIGHT_STEP_COUNT = PRE_FLIGHT_9470_STEPS.length;
