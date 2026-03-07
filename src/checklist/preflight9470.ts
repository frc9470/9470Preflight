import type { ChecklistStep } from "@/src/types/domain";

export const PRE_FLIGHT_9470_STEPS: ChecklistStep[] = [
  {
    id: "cold-1",
    section: "cold",
    category: "Hopper",
    prompt: "Inspect hopper screws/Loctite and pulleys for cracks or damage",
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
    prompt: "Inspect intake screws, bearings, and motor hardware",
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
    prompt: "Inspect shooter hood/mount/motor/shaft hardware and gear rack alignment",
    kind: "boolean",
    required: true
  },
  {
    id: "cold-10",
    section: "cold",
    category: "Wiring",
    prompt: "Confirm wiring is retained, clear, and passes tug test",
    kind: "boolean",
    required: true
  },
  {
    id: "cold-11",
    section: "cold",
    category: "Main Power",
    prompt: "Verify main breaker and lugs are tight with no crack or wiggle",
    kind: "boolean",
    required: true
  },
  {
    id: "cold-12",
    section: "cold",
    category: "Battery",
    prompt: "Confirm battery connector is fully seated and pins show no heat discoloration",
    kind: "boolean",
    required: true
  },
  {
    id: "cold-13",
    section: "cold",
    category: "Network",
    prompt: "Confirm Ethernet is latched, routed cleanly, and radio power is retained",
    kind: "boolean",
    required: true
  },
  {
    id: "cold-14",
    section: "cold",
    category: "Bumpers",
    prompt: "Verify bumpers are mounted tight with all screws and nuts present",
    kind: "boolean",
    required: true
  },
  {
    id: "cold-15",
    section: "cold",
    category: "Battery",
    prompt: "Battery Beak reading (%)",
    kind: "number",
    required: true,
    min: 130
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
    prompt: "Cycle intake deploy/retract smoothly with and without hopper extended (count)",
    kind: "counter",
    required: true,
    min: 5
  },
  {
    id: "hot-5",
    section: "hot",
    category: "Hopper",
    prompt: "Run hopper and listen for bad sounds; inspect grip tape/pulley condition",
    kind: "boolean",
    required: true
  },
  {
    id: "hot-6",
    section: "hot",
    category: "Scoring",
    prompt: "Run one full intake-to-hopper-to-shoot cycle through each shooter chamber",
    kind: "boolean",
    required: true
  },
  {
    id: "hot-7",
    section: "hot",
    category: "Battery",
    prompt: "PDH voltage reading",
    kind: "number",
    required: true,
    min: 13
  }
];

export const PRE_FLIGHT_STEP_COUNT = PRE_FLIGHT_9470_STEPS.length;
