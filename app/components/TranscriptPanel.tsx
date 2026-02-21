"use client";

import { useEffect, useRef } from "react";

interface TranscriptLine {
  time: number;
  speaker: string;
  text: string;
}

export function TranscriptPanel({ lines }: { lines: TranscriptLine[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines]);

  return (
    <div
      className="rounded-xl p-4 h-[500px] flex flex-col"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      <h2 className="text-sm font-semibold mb-3 uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
        Transcript
      </h2>
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-2 pr-2">
        {lines.length === 0 && (
          <p className="text-sm italic" style={{ color: "var(--text-muted)" }}>
            Waiting for session to start...
          </p>
        )}
        {lines.map((line, i) => (
          <div key={i} className="flex gap-3 text-sm">
            <span className="font-mono shrink-0 w-12 text-right" style={{ color: "var(--text-muted)" }}>
              {formatTime(line.time)}
            </span>
            <span
              className="font-semibold shrink-0 w-24"
              style={{
                color: line.speaker === "Speaker A" ? "var(--accent-light)" : "var(--green)",
              }}
            >
              {line.speaker}
            </span>
            <span style={{ color: "var(--text)" }}>{line.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
