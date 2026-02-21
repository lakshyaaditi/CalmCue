import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { DEFAULT_POLICY } from "@/lib/policy";

export async function GET() {
  try {
    const latest = await prisma.policy.findFirst({
      orderBy: { version: "desc" },
    });

    if (!latest) {
      return NextResponse.json({
        version: 1,
        params: DEFAULT_POLICY,
        explanation: "Default policy — no learning applied yet.",
      });
    }

    return NextResponse.json({
      version: latest.version,
      params: latest.policyJson,
      explanation: latest.explanation,
    });
  } catch (e) {
    console.error("Policy fetch error:", e);
    return NextResponse.json({
      version: 1,
      params: DEFAULT_POLICY,
      explanation: "Default policy (DB unavailable).",
    });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { params, explanation } = body;

    const latest = await prisma.policy.findFirst({
      orderBy: { version: "desc" },
    });

    const newVersion = (latest?.version || 0) + 1;

    const policy = await prisma.policy.create({
      data: {
        version: newVersion,
        policyJson: params,
        explanation: explanation || "Manual policy update.",
      },
    });

    return NextResponse.json({
      version: policy.version,
      params: policy.policyJson,
      explanation: policy.explanation,
    });
  } catch (e) {
    console.error("Policy create error:", e);
    return NextResponse.json(
      { error: "Failed to create policy" },
      { status: 500 }
    );
  }
}
