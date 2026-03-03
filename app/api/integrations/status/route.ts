import { NextResponse } from "next/server";

export async function GET(): Promise<NextResponse> {
  const nexusConfigured = Boolean(process.env.NEXUS_API_KEY);
  const tbaConfigured = Boolean(process.env.TBA_API_KEY);

  return NextResponse.json({
    nexus: {
      configured: nexusConfigured,
      baseUrl: process.env.NEXUS_BASE_URL ?? "https://nexus.firstinspires.org"
    },
    tba: {
      configured: tbaConfigured,
      baseUrl: process.env.TBA_BASE_URL ?? "https://www.thebluealliance.com/api/v3"
    },
    fallbackEnabled: true,
    serverTimeIso: new Date().toISOString()
  });
}
