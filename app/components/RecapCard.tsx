"use client";

export function RecapCard({
  text,
  bullets,
  loading,
  onDismiss,
  onSendToDiscord,
}: {
  text: string | null;
  bullets: string[];
  loading: boolean;
  onDismiss: () => void;
  onSendToDiscord?: () => void;
}) {
  return (
    <div className="fixed bottom-4 right-4 z-40 max-w-sm w-full">
      <div
        className="glass-card p-4"
        style={{ borderColor: "var(--accent)" }}
      >
        <div className="flex items-center justify-between mb-2">
          <h3
            className="text-sm font-semibold uppercase tracking-wider"
            style={{ color: "var(--accent-light)" }}
          >
            Focus Recap
          </h3>
          <button
            onClick={onDismiss}
            className="text-xs px-2 py-1 rounded"
            style={{ color: "var(--text-muted)" }}
          >
            Dismiss
          </button>
        </div>
        {loading ? (
          <div className="flex items-center gap-2">
            <div
              className="w-4 h-4 border-2 rounded-full animate-spin"
              style={{
                borderColor: "var(--accent)",
                borderTopColor: "transparent",
              }}
            />
            <span className="text-sm" style={{ color: "var(--text-muted)" }}>
              Generating recap...
            </span>
          </div>
        ) : (
          <>
            <div className="text-sm whitespace-pre-wrap" style={{ color: "var(--text)" }}>
              {text}
            </div>
            {bullets.length > 0 && onSendToDiscord && (
              <button
                type="button"
                onClick={onSendToDiscord}
                className="mt-3 w-full py-2 rounded-lg text-sm font-medium transition-all hover:opacity-90"
                style={{
                  background: "var(--accent)",
                  color: "white",
                }}
              >
                Send to Discord
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
