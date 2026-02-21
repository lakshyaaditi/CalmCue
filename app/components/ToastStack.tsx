"use client";

interface Toast {
  id: number;
  msg: string;
}

export function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 max-w-sm">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="toast-enter flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg cursor-pointer"
          style={{
            background: "var(--surface2)",
            border: "1px solid var(--border)",
          }}
          onClick={() => onDismiss(t.id)}
        >
          <span className="text-lg">🤫</span>
          <span className="text-sm" style={{ color: "var(--text)" }}>
            {t.msg}
          </span>
        </div>
      ))}
    </div>
  );
}
