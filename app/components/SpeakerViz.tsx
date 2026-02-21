"use client";

interface SpeakerState {
  label: string;
  rmsDb: number;
  isActive: boolean;
  rollingBaselineDb: number;
  isShouting: boolean;
}

export function SpeakerViz({
  speakers,
  isOverlapping,
}: {
  speakers?: [SpeakerState, SpeakerState];
  isOverlapping: boolean;
}) {
  const defaultSpeaker: SpeakerState = {
    label: "—",
    rmsDb: -Infinity,
    isActive: false,
    rollingBaselineDb: -30,
    isShouting: false,
  };

  const [a, b] = speakers ?? [
    { ...defaultSpeaker, label: "Speaker A" },
    { ...defaultSpeaker, label: "Speaker B" },
  ];

  return (
    <div
      className="glass-card p-4"
    >
      <h2 className="text-sm font-semibold mb-3 uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
        Speakers
      </h2>
      <div className="space-y-3">
        <SpeakerRow speaker={a} color="var(--accent-light)" />
        <SpeakerRow speaker={b} color="var(--green)" />
      </div>
      {isOverlapping && (
        <div
          className="mt-3 px-3 py-2 rounded-lg text-xs font-semibold text-center animate-pulse"
          style={{ background: "rgba(251, 146, 60, 0.15)", color: "var(--orange)" }}
        >
          OVERLAP DETECTED
        </div>
      )}
    </div>
  );
}

function SpeakerRow({ speaker, color }: { speaker: SpeakerState; color: string }) {
  // Map dB (-60 to 0) to 0-100 for bar width
  const level = Math.max(0, Math.min(100, ((speaker.rmsDb + 60) / 60) * 100));

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-semibold" style={{ color }}>
          {speaker.label}
        </span>
        <div className="flex items-center gap-2">
          {speaker.isShouting && (
            <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "rgba(248,113,113,0.2)", color: "var(--red)" }}>
              LOUD
            </span>
          )}
          {speaker.isActive && (
            <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "rgba(74,222,128,0.2)", color: "var(--green)" }}>
              ACTIVE
            </span>
          )}
        </div>
      </div>
      <div className="w-full h-2 rounded-full" style={{ background: "var(--surface2)" }}>
        <div
          className="h-full rounded-full transition-all duration-100"
          style={{
            width: `${level}%`,
            background: speaker.isShouting ? "var(--red)" : color,
          }}
        />
      </div>
      <div className="text-xs font-mono mt-0.5" style={{ color: "var(--text-muted)" }}>
        {speaker.rmsDb > -60 ? `${speaker.rmsDb.toFixed(1)} dB` : "Silent"}
      </div>
    </div>
  );
}
