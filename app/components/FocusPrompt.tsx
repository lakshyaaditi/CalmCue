"use client";

export function FocusPrompt({
  onRecap,
  onDismiss,
}: {
  onRecap: (windowSec: number) => void;
  onDismiss: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div
        className="pulse-border rounded-xl p-6 max-w-md w-full mx-4 border-2"
        style={{ background: "var(--surface)" }}
      >
        <h3
          className="text-lg font-semibold mb-2"
          style={{ color: "var(--orange)" }}
        >
          Too chaotic — want a recap?
        </h3>
        <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>
          The conversation is getting intense. Choose a recap window to catch up
          on what you missed.
        </p>
        <div className="flex gap-2 mb-4">
          {[15, 30, 60, 120].map((sec) => (
            <button
              key={sec}
              onClick={() => onRecap(sec)}
              className="flex-1 py-2 rounded-lg font-semibold text-sm transition-all hover:scale-105"
              style={{
                background: "var(--accent)",
                color: "white",
              }}
            >
              Last {sec}s
            </button>
          ))}
        </div>
        <button
          onClick={onDismiss}
          className="w-full py-2 rounded-lg text-sm"
          style={{
            background: "var(--surface2)",
            border: "1px solid var(--border)",
            color: "var(--text-muted)",
          }}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
