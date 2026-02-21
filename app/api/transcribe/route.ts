import { NextResponse } from "next/server";
import { transcribe } from "@/lib/transcribe";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const audioPath = body.audioPath as string | undefined;
    const entries = await transcribe(audioPath);
    return NextResponse.json({ entries });
  } catch (e) {
    console.error("Transcribe error:", e);
    return NextResponse.json(
      { error: "Transcription failed" },
      { status: 500 }
    );
  }
}
