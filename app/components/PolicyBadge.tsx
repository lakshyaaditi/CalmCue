"use client";

import { useState } from "react";

export function PolicyBadge({
  version,
  explanation,
}: {
  version: number;
  explanation: string;
}) {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div className="relative">
      <button
        className="px-3 py-1.5 rounded-lg text-sm font-mono transition-all hover:scale-105"
        style={{
          background: "var(--surface2)",
          border: "1px solid var(--accent)",
          color: "var(--accent-light)",
        }}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        onClick={() => setShowTooltip(!showTooltip)}
      >
        Policy v{version}
      </button>
      {showTooltip && (
        <div
          className="absolute top-full right-0 mt-2 p-3 rounded-lg text-sm max-w-xs z-30 shadow-lg"
          style={{
            background: "var(--surface2)",
            border: "1px solid var(--border)",
            color: "var(--text-muted)",
          }}
        >
          {explanation}
        </div>
      )}
    </div>
  );
}
