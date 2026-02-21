"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AudioEngine, type EngineState } from "@/lib/audioEngine";
import { type PolicyParams, DEFAULT_POLICY } from "@/lib/policy";
import { TranscriptPanel } from "./components/TranscriptPanel";
import { ChaosMeter } from "./components/ChaosMeter";
import { ToastStack } from "./components/ToastStack";
import { FocusPrompt } from "./components/FocusPrompt";
import { RecapCard } from "./components/RecapCard";
import { PolicyBadge } from "./components/PolicyBadge";
import { SpeakerViz } from "./components/SpeakerViz";

interface TranscriptLine {
  time: number;
  speaker: string;
  text: string;
}

export default function Home() {
  const [isRunning, setIsRunning] = useState(false);
  const [engineState, setEngineState] = useState<EngineState | null>(null);
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [visibleLines, setVisibleLines] = useState<TranscriptLine[]>([]);
  const [toasts, setToasts] = useState<{ id: number; msg: string }[]>([]);
  const [showFocusPrompt, setShowFocusPrompt] = useState(false);
  const [recapText, setRecapText] = useState<string | null>(null);
  const [recapBullets, setRecapBullets] = useState<string[]>([]);
  const [recapLastSeconds, setRecapLastSeconds] = useState<number>(15);
  const [recapSource, setRecapSource] = useState<"airia" | "fallback">("fallback");
  const [recapLoading, setRecapLoading] = useState(false);
  const [policyVersion, setPolicyVersion] = useState(1);
  const [policyExplanation, setPolicyExplanation] = useState("Default policy — no learning applied yet.");
  const [policy, setPolicy] = useState<PolicyParams>(DEFAULT_POLICY);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [feedbackCounts, setFeedbackCounts] = useState({ aggressive: 0, weak: 0 });
  const [sessionEnded, setSessionEnded] = useState(false);
  const [endResult, setEndResult] = useState<{
    reward: number;
    newPolicy?: { version: number; explanation: string } | null;
  } | null>(null);

  const engineRef = useRef<AudioEngine | null>(null);
  const audioARef = useRef<HTMLAudioElement | null>(null);
  const audioBRef = useRef<HTMLAudioElement | null>(null);
  const audioContainerRef = useRef<HTMLDivElement | null>(null);
  const toastIdRef = useRef(0);
  const transcriptTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionStartTimeRef = useRef<number>(0);

  // Load policy on mount
  useEffect(() => {
    fetch("/api/policy")
      .then((r) => r.json())
      .then((data) => {
        if (data.params) {
          setPolicy(data.params);
          setPolicyVersion(data.version);
          setPolicyExplanation(data.explanation);
        }
      })
      .catch(() => {});
  }, []);

  const addToast = useCallback((msg: string) => {
    const id = ++toastIdRef.current;
    setToasts((prev) => [...prev, { id, msg }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  const startDemo = useCallback(async () => {
    // Reset state
    setEngineState(null);
    setTranscript([]);
    setVisibleLines([]);
    setToasts([]);
    setShowFocusPrompt(false);
    setRecapText(null);
    setRecapBullets([]);
    setFeedbackCounts({ aggressive: 0, weak: 0 });
    setSessionEnded(false);
    setEndResult(null);

    // Fetch transcript
    let transcriptData: TranscriptLine[] = [];
    try {
      const res = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      transcriptData = data.entries || [];
    } catch {
      transcriptData = [];
    }
    setTranscript(transcriptData);

    // Start session in DB
    let sid: string | null = null;
    try {
      const res = await fetch("/api/session/start", { method: "POST" });
      const data = await res.json();
      sid = data.sessionId;
      if (data.policyJson) {
        setPolicy(data.policyJson as PolicyParams);
        setPolicyVersion(data.policyVersion);
      }
    } catch {
      // Continue without DB
    }
    setSessionId(sid);

    // Reload policy
    try {
      const res = await fetch("/api/policy");
      const data = await res.json();
      if (data.params) {
        setPolicy(data.params);
        setPolicyVersion(data.version);
        setPolicyExplanation(data.explanation);
      }
    } catch {}

    // Destroy previous engine + audio elements (createMediaElementSource is one-shot)
    engineRef.current?.destroy();
    engineRef.current = null;
    if (audioARef.current) { audioARef.current.pause(); audioARef.current.remove(); }
    if (audioBRef.current) { audioBRef.current.pause(); audioBRef.current.remove(); }

    // Create fresh audio elements
    const audioA = document.createElement("audio");
    audioA.crossOrigin = "anonymous";
    audioA.preload = "auto";
    audioA.src = "/demo/speakerA.wav";
    const audioB = document.createElement("audio");
    audioB.crossOrigin = "anonymous";
    audioB.preload = "auto";
    audioB.src = "/demo/speakerB.wav";
    audioContainerRef.current?.appendChild(audioA);
    audioContainerRef.current?.appendChild(audioB);
    audioARef.current = audioA;
    audioBRef.current = audioB;

    // Wait for both files to load so Speaker A and B are audible when we play
    await Promise.all([
      new Promise<void>((resolve, reject) => {
        if (audioA.readyState >= 3) { resolve(); return; }
        audioA.oncanplaythrough = () => resolve();
        audioA.onerror = () => reject(new Error("Speaker A audio failed to load"));
      }),
      new Promise<void>((resolve, reject) => {
        if (audioB.readyState >= 3) { resolve(); return; }
        audioB.oncanplaythrough = () => resolve();
        audioB.onerror = () => reject(new Error("Speaker B audio failed to load"));
      }),
    ]);

    const engine = new AudioEngine();
    engineRef.current = engine;
    engine.setPolicy(policy);

    engine.onStateUpdate((state) => setEngineState(state));
    engine.onToastCue((msg) => addToast(msg));
    engine.onFocusPromptCue(() => setShowFocusPrompt(true));

    await engine.init(audioA, audioB);
    engine.start();

    // Play audio (B starts 1s later for overlap)
    audioA.currentTime = 0;
    audioB.currentTime = 0;
    const playA = audioA.play();
    if (playA) playA.catch((e) => console.warn("Speaker A play failed:", e));
    setTimeout(() => {
      const playB = audioB.play();
      if (playB) playB.catch((e) => console.warn("Speaker B play failed:", e));
    }, 1000);

    sessionStartTimeRef.current = Date.now();
    setIsRunning(true);

    // Feed transcript lines based on playback time
    const startTime = Date.now();
    transcriptTimerRef.current = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000;
      const visible = transcriptData.filter((l) => l.time <= elapsed);
      setVisibleLines(visible);
    }, 300);

    // Auto-stop when audio ends
    const onEnded = () => {
      if (!audioA.paused && !audioB.paused) return; // one still playing
      // Both done
    };
    audioA.addEventListener("ended", onEnded);
    audioB.addEventListener("ended", onEnded);
  }, [addToast, policy]);

  const endSession = useCallback(async () => {
    // Stop engine
    engineRef.current?.stop();
    audioARef.current?.pause();
    audioBRef.current?.pause();
    if (transcriptTimerRef.current) clearInterval(transcriptTimerRef.current);

    setIsRunning(false);
    setSessionEnded(true);

    if (!sessionId || !engineRef.current) return;

    const metrics = engineRef.current.getSessionMetrics();
    try {
      const res = await fetch("/api/session/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          metrics: {
            ...metrics,
            feedbackTooAggressiveCount: feedbackCounts.aggressive,
            feedbackTooWeakCount: feedbackCounts.weak,
          },
        }),
      });
      const data = await res.json();
      setEndResult(data);
      if (data.newPolicy) {
        setPolicyVersion(data.newPolicy.version);
        setPolicyExplanation(data.newPolicy.explanation);
        setPolicy(data.newPolicy.params);
        // Also save to localStorage
        localStorage.setItem("calmcue_policy", JSON.stringify(data.newPolicy));
      }
    } catch (e) {
      console.error("Failed to end session:", e);
    }
  }, [sessionId, feedbackCounts]);

  const handleFeedback = useCallback(
    (type: "aggressive" | "weak") => {
      setFeedbackCounts((prev) => ({
        aggressive: type === "aggressive" ? prev.aggressive + 1 : prev.aggressive,
        weak: type === "weak" ? prev.weak + 1 : prev.weak,
      }));
      addToast(type === "aggressive" ? "Noted: shields too aggressive" : "Noted: shields too weak");

      // Persist feedback to DB
      if (sessionId) {
        fetch("/api/session/end", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId,
            metrics: {
              ...engineRef.current?.getSessionMetrics(),
              feedbackTooAggressiveCount:
                feedbackCounts.aggressive + (type === "aggressive" ? 1 : 0),
              feedbackTooWeakCount:
                feedbackCounts.weak + (type === "weak" ? 1 : 0),
            },
          }),
        }).catch(() => {});
      }
    },
    [addToast, sessionId, feedbackCounts]
  );

  const requestRecap = useCallback(
    async (windowSec: number) => {
      setRecapLoading(true);
      setShowFocusPrompt(false);
      engineRef.current?.resetFocusPrompt();
      engineRef.current?.incrementRecaps();

      const transcriptLines = visibleLines.map((l) => ({
        ts: sessionStartTimeRef.current + l.time * 1000,
        speaker: l.speaker,
        text: l.text,
      }));

      try {
        const res = await fetch("/api/focus-summary", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            roomId: sessionId ?? "demo",
            userId: sessionId ?? "demo",
            lastSeconds: windowSec,
            transcriptLines,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setRecapText(data.error ?? "Could not generate recap. Please try again.");
          setRecapBullets([]);
        } else {
          setRecapText(data.summary);
          setRecapBullets(data.bullets ?? []);
          setRecapLastSeconds(windowSec);
          setRecapSource((data.source as "airia" | "fallback") ?? "fallback");
          if ((data.source as string) === "fallback" && data.errorMessage) {
            addToast(data.errorMessage);
          } else if ((data.source as string) === "fallback") {
            addToast("Quick recap (set AIRIA_API_KEY in .env for AI summary)");
          }
        }
      } catch {
        setRecapText("Could not generate recap. Please try again.");
        setRecapBullets([]);
      }
      setRecapLoading(false);
    },
    [visibleLines, sessionId, addToast]
  );

  return (
    <main className="min-h-screen p-4 md:p-6 max-w-7xl mx-auto">
      {/* Header — glass nav bar matching index.html */}
      <header className="glass-card flex items-center justify-between gap-3.5 px-3.5 py-3 mb-6">
        <div className="flex items-center gap-3">
          <div
            className="w-[38px] h-[38px] rounded-[14px] p-px"
            style={{ background: "linear-gradient(135deg, rgba(99,102,241,.7), rgba(16,185,129,.7))" }}
          >
            <div
              className="w-full h-full rounded-[13px] flex items-center justify-center font-bold"
              style={{ background: "var(--bg)" }}
            >
              C
            </div>
          </div>
          <div>
            <div className="font-bold text-sm leading-tight">CalmCue</div>
            <div className="text-xs" style={{ color: "var(--text-muted2, var(--text-muted))" }}>
              calmer voice rooms
            </div>
          </div>
        </div>
        <PolicyBadge version={policyVersion} explanation={policyExplanation} />
      </header>

      {/* Container for dynamically created audio elements */}
      <div ref={audioContainerRef} className="hidden" />

      {/* Controls */}
      <div className="flex items-center gap-3 mb-6">
        {!isRunning && !sessionEnded && (
          <button
            onClick={startDemo}
            className="px-6 py-3 rounded-[14px] font-bold text-sm transition-all hover:opacity-90"
            style={{ background: "#fff", color: "#000", border: "none" }}
          >
            Run Demo Session
          </button>
        )}
        {isRunning && (
          <>
            <button
              onClick={endSession}
              className="px-6 py-3 rounded-[14px] text-sm transition-all hover:bg-white/10"
              style={{ background: "var(--surface)", border: "1px solid var(--border)", backdropFilter: "blur(10px)" }}
            >
              End Session
            </button>
            <button
              onClick={() => handleFeedback("aggressive")}
              className="px-4 py-2 rounded-[14px] text-sm transition-all hover:bg-white/10"
              style={{ background: "var(--surface)", border: "1px solid var(--red)", color: "var(--red)", backdropFilter: "blur(10px)" }}
            >
              Too Aggressive
            </button>
            <button
              onClick={() => handleFeedback("weak")}
              className="px-4 py-2 rounded-[14px] text-sm transition-all hover:bg-white/10"
              style={{ background: "var(--surface)", border: "1px solid var(--yellow)", color: "var(--yellow)", backdropFilter: "blur(10px)" }}
            >
              Too Weak
            </button>
          </>
        )}
        {sessionEnded && !isRunning && (
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                setSessionEnded(false);
                setEndResult(null);
                startDemo();
              }}
              className="px-6 py-3 rounded-[14px] font-bold text-sm transition-all hover:opacity-90"
              style={{ background: "#fff", color: "#000", border: "none" }}
            >
              Run Demo Session Again
            </button>
          </div>
        )}
      </div>

      {/* Session end results */}
      {endResult && (
        <div
          className="glass-card mb-6 p-4"
          style={{ borderColor: "var(--accent)" }}
        >
          <h3 className="font-semibold mb-2" style={{ color: "var(--accent-light)" }}>
            Session Results
          </h3>
          <p className="text-sm mb-1">
            Reward: <span className="font-mono">{endResult.reward.toFixed(2)}</span>
          </p>
          <p className="text-sm mb-1">
            Feedback: {feedbackCounts.aggressive} too aggressive, {feedbackCounts.weak} too weak
          </p>
          {endResult.newPolicy && (
            <div className="mt-2 p-3 rounded" style={{ background: "var(--surface2)" }}>
              <p className="text-sm font-semibold" style={{ color: "var(--green)" }}>
                Policy updated to v{endResult.newPolicy.version}
              </p>
              <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
                {endResult.newPolicy.explanation}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: Speaker visualizations + Chaos meter */}
        <div className="lg:col-span-1 space-y-4">
          <SpeakerViz speakers={engineState?.speakers} isOverlapping={engineState?.isOverlapping ?? false} />
          <ChaosMeter metrics={engineState?.metrics ?? null} policy={policy} />
        </div>

        {/* Right: Transcript */}
        <div className="lg:col-span-2">
          <TranscriptPanel lines={visibleLines} />
        </div>
      </div>

      {/* Toast stack */}
      <ToastStack toasts={toasts} onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))} />

      {/* Focus mode prompt */}
      {showFocusPrompt && (
        <FocusPrompt
          onRecap={requestRecap}
          onDismiss={() => {
            setShowFocusPrompt(false);
            engineRef.current?.resetFocusPrompt();
          }}
        />
      )}

      {/* Recap card */}
      {(recapText || recapLoading) && (
        <RecapCard
          text={recapText}
          bullets={recapBullets}
          loading={recapLoading}
          onDismiss={() => {
            setRecapText(null);
            setRecapBullets([]);
          }}
          onSendToDiscord={async () => {
            if (recapBullets.length === 0) return;
            try {
              const res = await fetch("/api/discord/post-focus", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  roomId: sessionId ?? "demo",
                  userId: sessionId ?? "demo",
                  bullets: recapBullets,
                  lastSeconds: recapLastSeconds,
                  source: recapSource,
                }),
              });
              const data = await res.json();
              if (res.ok && data.success) {
                addToast("Posted to Discord channel");
              } else if (data.configured === false) {
                addToast("Discord not configured");
              } else {
                addToast("Failed to post to Discord");
              }
            } catch {
              addToast("Failed to post to Discord");
            }
          }}
        />
      )}
    </main>
  );
}
