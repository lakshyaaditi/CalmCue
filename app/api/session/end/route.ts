import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { adjustPolicy, DEFAULT_POLICY, type PolicyParams } from "@/lib/policy";
import { logSessionEnd } from "@/lib/services/braintrustLogger";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { sessionId, metrics } = body as {
      sessionId: string;
      metrics: {
        overlapSeconds: number;
        interruptionsCount: number;
        shoutSpikesCount: number;
        toastCount: number;
        focusPromptsCount: number;
        recapsSentCount: number;
        feedbackTooAggressiveCount: number;
        feedbackTooWeakCount: number;
      };
    };

    if (!sessionId || !metrics) {
      return NextResponse.json({ error: "Missing sessionId or metrics" }, { status: 400 });
    }

    const overloadScore =
      metrics.overlapSeconds +
      2 * metrics.interruptionsCount +
      3 * metrics.shoutSpikesCount;
    const annoyanceScore =
      0.5 * metrics.toastCount +
      3 * metrics.feedbackTooAggressiveCount;
    const reward = -overloadScore - annoyanceScore;

    // Update session
    await prisma.session.update({
      where: { id: sessionId },
      data: {
        metricsJson: { ...metrics, overloadScore, annoyanceScore },
        reward,
      },
    });

    // Get latest policy
    const latestPolicy = await prisma.policy.findFirst({
      orderBy: { version: "desc" },
    });

    const currentVersion = latestPolicy?.version || 0;
    const currentParams: PolicyParams = latestPolicy
      ? (latestPolicy.policyJson as unknown as PolicyParams)
      : DEFAULT_POLICY;

    // Adjust policy if learning enabled and there's feedback
    let newPolicy = null;
    if (
      currentParams.learningEnabled &&
      (metrics.feedbackTooAggressiveCount > 0 || metrics.feedbackTooWeakCount > 0)
    ) {
      const { updated, explanation } = adjustPolicy(
        currentParams,
        metrics.feedbackTooAggressiveCount,
        metrics.feedbackTooWeakCount
      );

      newPolicy = await prisma.policy.create({
        data: {
          version: currentVersion + 1,
          policyJson: JSON.parse(JSON.stringify(updated)),
          explanation,
        },
      });
    }

    await logSessionEnd({
      sessionId,
      reward,
      overloadScore,
      annoyanceScore,
      metrics,
      ...(newPolicy && { newPolicyVersion: newPolicy.version }),
    });

    return NextResponse.json({
      reward,
      overloadScore,
      annoyanceScore,
      newPolicy: newPolicy
        ? {
            version: newPolicy.version,
            params: newPolicy.policyJson,
            explanation: newPolicy.explanation,
          }
        : null,
    });
  } catch (e) {
    console.error("Session end error:", e);
    return NextResponse.json(
      { error: "Failed to end session" },
      { status: 500 }
    );
  }
}
