"use client";

import { type PolicyParams } from "@/lib/policy";

interface ChaosMetrics {
  overlapRatio: number;
  interruptionsCount: number;
  shoutSpikesCount: number;
  chaosScore: number;
}

export function ChaosMeter({
  metrics,
  policy,
}: {
  metrics: ChaosMetrics | null;
  policy: PolicyParams;
}) {
  const score = metrics?.chaosScore ?? 0;
  const aboveThreshold = score > policy.k;

  const scoreColor =
    score < 30
      ? "var(--green)"
      : score < 60
      ? "var(--yellow)"
      : score < 80
      ? "var(--orange)"
      : "var(--red)";

  return (
    <div
      className={`glass-card p-4 transition-all duration-300 ${
        aboveThreshold ? "chaos-danger" : score > 30 ? "chaos-glow" : ""
      }`}
    >
      <h2 className="text-sm font-semibold mb-3 uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
        Chaos Meter
      </h2>

      {/* Big score */}
      <div className="flex items-end gap-2 mb-4">
        <span className="text-5xl font-bold font-mono transition-colors duration-300" style={{ color: scoreColor }}>
          {score}
        </span>
        <span className="text-lg mb-1" style={{ color: "var(--text-muted)" }}>
          / 100
        </span>
      </div>

      {/* Progress bar */}
      <div className="w-full h-3 rounded-full mb-4" style={{ background: "var(--surface2)" }}>
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{
            width: `${score}%`,
            background: scoreColor,
          }}
        />
      </div>

      {/* Threshold line */}
      <div className="flex items-center gap-2 mb-4 text-xs" style={{ color: "var(--text-muted)" }}>
        <span>Focus threshold (k={policy.k})</span>
        {aboveThreshold && (
          <span className="px-2 py-0.5 rounded text-xs font-semibold" style={{ background: "var(--red)", color: "white" }}>
            ABOVE
          </span>
        )}
      </div>

      {/* Breakdowns */}
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span style={{ color: "var(--text-muted)" }}>Overlap ratio</span>
          <span className="font-mono">{((metrics?.overlapRatio ?? 0) * 100).toFixed(1)}%</span>
        </div>
        <div className="flex justify-between">
          <span style={{ color: "var(--text-muted)" }}>Interruptions</span>
          <span className="font-mono">{metrics?.interruptionsCount ?? 0}</span>
        </div>
        <div className="flex justify-between">
          <span style={{ color: "var(--text-muted)" }}>Loudness spikes</span>
          <span className="font-mono">{metrics?.shoutSpikesCount ?? 0}</span>
        </div>
      </div>
    </div>
  );
}
