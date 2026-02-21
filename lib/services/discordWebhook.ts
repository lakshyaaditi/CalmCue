/**
 * Post Focus Mode recap to Discord via incoming webhook.
 * No secrets in frontend; all calls from server only.
 */

export interface PostToDiscordParams {
  roomId: string;
  title: string;
  bullets: string[];
  url?: string;
  userId?: string;
  /** Selected window e.g. 15, 30 → "last 15s" / "last 30s" */
  lastSeconds?: number;
  /** "airia" | "fallback" so Discord can show "Summarized by Airia" */
  source?: "airia" | "fallback";
}

/**
 * POST to Discord incoming webhook. Does not throw; returns success flag.
 * If DISCORD_WEBHOOK_URL is missing, returns { ok: false, reason: "not_configured" }.
 */
export async function postToDiscord(
  params: PostToDiscordParams
): Promise<{ ok: boolean; reason?: string }> {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL?.trim();
  if (!webhookUrl) {
    return { ok: false, reason: "not_configured" };
  }

  const { roomId, title, bullets, url, userId, lastSeconds, source } = params;
  const timeStr = new Date().toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const windowLabel = lastSeconds != null ? ` (last ${lastSeconds}s)` : "";
  const description = bullets.join("\n").slice(0, 1000);
  const embed: Record<string, unknown> = {
    title: (title + windowLabel).slice(0, 256),
    description: description || "No recap content.",
    color: 0x0d9488, // teal
    fields: [
      { name: "Room", value: roomId, inline: true },
      { name: "Time", value: timeStr, inline: true },
      ...(source ? [{ name: "Summary", value: source === "airia" ? "Summarized by Airia" : "Quick recap (Airia unavailable)", inline: true }] : []),
    ],
  };
  if (userId) {
    (embed.fields as { name: string; value: string; inline: boolean }[]).push({
      name: "User",
      value: userId,
      inline: true,
    });
  }
  if (url) {
    (embed.fields as { name: string; value: string; inline: boolean }[]).push({
      name: "Join",
      value: url,
      inline: false,
    });
  }

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: lastSeconds != null ? `**Focus Mode Recap** (last ${lastSeconds}s)` : "**Focus Mode Recap**",
        embeds: [embed],
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error("Discord webhook error:", res.status, text);
      return { ok: false, reason: "webhook_failed" };
    }
    return { ok: true };
  } catch (e) {
    console.error("Discord webhook request failed:", e);
    return { ok: false, reason: "request_failed" };
  }
}
