import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST() {
  try {
    // Get latest policy version
    const latestPolicy = await prisma.policy.findFirst({
      orderBy: { version: "desc" },
    });

    let policyVersion = 1;
    let policyJson = null;

    if (latestPolicy) {
      policyVersion = latestPolicy.version;
      policyJson = latestPolicy.policyJson;
    }

    // Create a new session
    const session = await prisma.session.create({
      data: {
        policyVersionUsed: policyVersion,
        metricsJson: {},
        reward: 0,
      },
    });

    return NextResponse.json({
      sessionId: session.id,
      policyVersion,
      policyJson,
    });
  } catch (e) {
    console.error("Session start error:", e);
    return NextResponse.json(
      { error: "Failed to start session" },
      { status: 500 }
    );
  }
}
