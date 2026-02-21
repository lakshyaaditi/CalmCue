import { NextResponse } from "next/server";
import { z } from "zod";
import { getFocusSummary } from "@/lib/services/airiaGateway";
import { logFocusSummary } from "@/lib/services/braintrustLogger";

const FocusSummaryBodySchema = z.object({
  roomId: z.string().optional(),
  userId: z.string().optional(),
  lastSeconds: z.number().min(1).max(300).default(15),
  transcriptLines: z.array(
    z.object({
      ts: z.number(),
      speaker: z.string(),
      text: z.string(),
    })
  ),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = FocusSummaryBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid body", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { lastSeconds, transcriptLines } = parsed.data;
    const result = await getFocusSummary(transcriptLines, lastSeconds);
    const { bullets, source, errorMessage } = result;
    const summary = bullets.join("\n");

    await logFocusSummary({
      lastSeconds,
      transcriptLineCount: transcriptLines.length,
      source,
      bulletsCount: bullets.length,
      ...(errorMessage && { errorMessage }),
    });

    return NextResponse.json({
      summary,
      bullets,
      source,
      ...(errorMessage && { errorMessage }),
    });
  } catch (e) {
    console.error("Focus summary error:", e);
    return NextResponse.json(
      { error: "Focus summarization failed" },
      { status: 500 }
    );
  }
}
