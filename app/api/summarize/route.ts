import { NextResponse } from "next/server";
import { summarizeTranscript, type TranscriptLine } from "@/lib/summarize";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { transcriptLines, windowSec } = body as {
      transcriptLines: TranscriptLine[];
      windowSec: number;
    };

    if (!transcriptLines || !windowSec) {
      return NextResponse.json(
        { error: "Missing transcriptLines or windowSec" },
        { status: 400 }
      );
    }

    const summary = await summarizeTranscript(transcriptLines, windowSec);
    return NextResponse.json({ summary });
  } catch (e) {
    console.error("Summarize error:", e);
    return NextResponse.json(
      { error: "Summarization failed" },
      { status: 500 }
    );
  }
}
