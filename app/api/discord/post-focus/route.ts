import { NextResponse } from "next/server";
import { z } from "zod";
import { postToDiscord } from "@/lib/services/discordWebhook";

const PostFocusBodySchema = z.object({
  roomId: z.string(),
  userId: z.string().optional(),
  bullets: z.array(z.string()).min(1).max(10),
  joinUrl: z.string().url().optional(),
  lastSeconds: z.number().optional(),
  source: z.enum(["airia", "fallback"]).optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = PostFocusBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid body", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { roomId, userId, bullets, joinUrl, lastSeconds, source } = parsed.data;
    const result = await postToDiscord({
      roomId,
      title: "Focus Mode Recap",
      bullets,
      url: joinUrl,
      userId,
      lastSeconds,
      source,
    });

    if (!result.ok) {
      if (result.reason === "not_configured") {
        return NextResponse.json(
          { error: "Discord not configured", configured: false },
          { status: 503 }
        );
      }
      return NextResponse.json(
        { error: "Failed to post to Discord", reason: result.reason },
        { status: 502 }
      );
    }

    return NextResponse.json({ success: true, configured: true });
  } catch (e) {
    console.error("Discord post-focus error:", e);
    return NextResponse.json(
      { error: "Discord post failed" },
      { status: 500 }
    );
  }
}
