import { NextResponse } from "next/server";
import { transcribe } from "@/lib/transcribe";

export async function POST() {
  try {
    const entries = await transcribe();

    return NextResponse.json({
      entries,
      source: process.env.MODULATE_API_KEY ? "modulate" : "mock",
    });
  } catch (e) {
    console.error("Transcribe error:", e);
    return NextResponse.json(
      { error: "Transcription failed" },
      { status: 500 }
    );
  }
}
