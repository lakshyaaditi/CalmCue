// Client-side audio analysis engine using Web Audio API
// This file runs entirely in the browser

import { type PolicyParams, DEFAULT_POLICY } from "./policy";

export interface SpeakerState {
  label: string;
  rmsDb: number;
  isActive: boolean;           // VAD result
  rollingBaselineDb: number;
  isShouting: boolean;
}

export interface ChaosMetrics {
  overlapRatio: number;        // 0..1 of recent window
  interruptionsCount: number;
  shoutSpikesCount: number;
  chaosScore: number;          // 0..100
}

export interface EngineState {
  speakers: [SpeakerState, SpeakerState];
  metrics: ChaosMetrics;
  isOverlapping: boolean;
  overlapDurationMs: number;
  sessionOverlapSeconds: number;
  sessionInterruptions: number;
  sessionShoutSpikes: number;
  toastCount: number;
  focusPromptsCount: number;
  recapsSentCount: number;
}

type Callback = (state: EngineState) => void;
type ToastCallback = (msg: string) => void;
type FocusCallback = () => void;

const VAD_THRESHOLD_DB = -45;
const VAD_HANGOVER_MS = 300;
const BASELINE_ALPHA = 0.02;
const ANALYSIS_INTERVAL_MS = 50;
const CHAOS_WINDOW_MS = 5000;

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private sources: (MediaElementAudioSourceNode | null)[] = [null, null];
  private gainNodes: (GainNode | null)[] = [null, null];
  private analysers: (AnalyserNode | null)[] = [null, null];
  private compressors: (DynamicsCompressorNode | null)[] = [null, null];
  private timeDomainBuffers: Float32Array<ArrayBuffer>[] = [];

  private policy: PolicyParams = { ...DEFAULT_POLICY };
  private state: EngineState;
  private intervalId: ReturnType<typeof setInterval> | null = null;

  // VAD state per speaker
  private vadActive: boolean[] = [false, false];
  private vadLastActiveTime: number[] = [0, 0];
  private wasActive: boolean[] = [false, false];

  // Overlap tracking
  private overlapStartTime: number = 0;
  private isCurrentlyOverlapping: boolean = false;
  private totalOverlapMs: number = 0;

  // Chaos score window
  private overlapSamplesInWindow: number = 0;
  private totalSamplesInWindow: number = 0;

  // Toast cooldown
  private lastToastTime: number = 0;

  // Focus prompt
  private chaosAboveKSince: number = 0;
  private focusPromptShown: boolean = false;
  private readonly FOCUS_PROMPT_DELAY_MS = 5000; // 5s above threshold

  // Callbacks
  private onUpdate: Callback | null = null;
  private onToast: ToastCallback | null = null;
  private onFocusPrompt: FocusCallback | null = null;

  constructor() {
    this.state = this.createInitialState();
    this.timeDomainBuffers = [new Float32Array(2048) as Float32Array<ArrayBuffer>, new Float32Array(2048) as Float32Array<ArrayBuffer>];
  }

  private createInitialState(): EngineState {
    return {
      speakers: [
        { label: "Speaker A", rmsDb: -Infinity, isActive: false, rollingBaselineDb: -30, isShouting: false },
        { label: "Speaker B", rmsDb: -Infinity, isActive: false, rollingBaselineDb: -30, isShouting: false },
      ],
      metrics: { overlapRatio: 0, interruptionsCount: 0, shoutSpikesCount: 0, chaosScore: 0 },
      isOverlapping: false,
      overlapDurationMs: 0,
      sessionOverlapSeconds: 0,
      sessionInterruptions: 0,
      sessionShoutSpikes: 0,
      toastCount: 0,
      focusPromptsCount: 0,
      recapsSentCount: 0,
    };
  }

  setPolicy(p: PolicyParams) {
    this.policy = { ...p };
  }

  getPolicy(): PolicyParams {
    return { ...this.policy };
  }

  onStateUpdate(cb: Callback) { this.onUpdate = cb; }
  onToastCue(cb: ToastCallback) { this.onToast = cb; }
  onFocusPromptCue(cb: FocusCallback) { this.onFocusPrompt = cb; }

  async init(audioElementA: HTMLAudioElement, audioElementB: HTMLAudioElement) {
    this.ctx = new AudioContext();
    const elements = [audioElementA, audioElementB];

    for (let i = 0; i < 2; i++) {
      this.sources[i] = this.ctx.createMediaElementSource(elements[i]);
      this.gainNodes[i] = this.ctx.createGain();
      this.analysers[i] = this.ctx.createAnalyser();
      this.analysers[i]!.fftSize = 2048;
      this.compressors[i] = this.ctx.createDynamicsCompressor();

      this.sources[i]!
        .connect(this.gainNodes[i]!)
        .connect(this.compressors[i]!)
        .connect(this.analysers[i]!)
        .connect(this.ctx.destination);
    }
  }

  start() {
    this.state = this.createInitialState();
    this.totalOverlapMs = 0;
    this.overlapSamplesInWindow = 0;
    this.totalSamplesInWindow = 0;
    this.lastToastTime = 0;
    this.chaosAboveKSince = 0;
    this.focusPromptShown = false;
    this.vadActive = [false, false];
    this.wasActive = [false, false];

    this.intervalId = setInterval(() => this.analyze(), ANALYSIS_INTERVAL_MS);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  destroy() {
    this.stop();
    this.ctx?.close();
    this.ctx = null;
  }

  incrementRecaps() {
    this.state.recapsSentCount++;
  }

  incrementFocusPrompts() {
    this.state.focusPromptsCount++;
  }

  getSessionMetrics() {
    return {
      overlapSeconds: this.state.sessionOverlapSeconds,
      interruptionsCount: this.state.sessionInterruptions,
      shoutSpikesCount: this.state.sessionShoutSpikes,
      toastCount: this.state.toastCount,
      focusPromptsCount: this.state.focusPromptsCount,
      recapsSentCount: this.state.recapsSentCount,
    };
  }

  resetFocusPrompt() {
    this.focusPromptShown = false;
    this.chaosAboveKSince = 0;
  }

  private analyze() {
    const now = performance.now();

    for (let i = 0; i < 2; i++) {
      if (!this.analysers[i]) continue;
      this.analysers[i]!.getFloatTimeDomainData(this.timeDomainBuffers[i]);

      // Compute RMS -> dB
      let sum = 0;
      for (let j = 0; j < this.timeDomainBuffers[i].length; j++) {
        sum += this.timeDomainBuffers[i][j] * this.timeDomainBuffers[i][j];
      }
      const rms = Math.sqrt(sum / this.timeDomainBuffers[i].length);
      const db = rms > 0 ? 20 * Math.log10(rms) : -Infinity;

      this.state.speakers[i].rmsDb = db;

      // Update rolling baseline
      if (db > -60) {
        this.state.speakers[i].rollingBaselineDb =
          (1 - BASELINE_ALPHA) * this.state.speakers[i].rollingBaselineDb +
          BASELINE_ALPHA * db;
      }

      // VAD with hangover
      const wasActiveBefore = this.vadActive[i];
      if (db > VAD_THRESHOLD_DB) {
        this.vadActive[i] = true;
        this.vadLastActiveTime[i] = now;
      } else if (now - this.vadLastActiveTime[i] > VAD_HANGOVER_MS) {
        this.vadActive[i] = false;
      }

      this.state.speakers[i].isActive = this.vadActive[i];

      // Shout detection
      const delta = db - this.state.speakers[i].rollingBaselineDb;
      if (delta > this.policy.shoutDeltaDb && !this.state.speakers[i].isShouting) {
        this.state.speakers[i].isShouting = true;
        this.state.sessionShoutSpikes++;
      } else if (delta < this.policy.shoutDeltaDb - 3) {
        this.state.speakers[i].isShouting = false;
      }

      // Interruption detection: speaker becomes active while the other was active
      if (this.vadActive[i] && !wasActiveBefore) {
        const otherIdx = 1 - i;
        if (this.wasActive[otherIdx]) {
          this.state.sessionInterruptions++;
        }
      }

      this.wasActive[i] = this.vadActive[i];
    }

    // Overlap
    const bothActive = this.vadActive[0] && this.vadActive[1];
    this.totalSamplesInWindow++;
    if (bothActive) {
      this.overlapSamplesInWindow++;
    }

    // Trim window
    if (this.totalSamplesInWindow > CHAOS_WINDOW_MS / ANALYSIS_INTERVAL_MS) {
      this.overlapSamplesInWindow = Math.max(
        0,
        this.overlapSamplesInWindow - (bothActive ? 0 : 1)
      );
      this.totalSamplesInWindow = CHAOS_WINDOW_MS / ANALYSIS_INTERVAL_MS;
    }

    if (bothActive) {
      if (!this.isCurrentlyOverlapping) {
        this.overlapStartTime = now;
        this.isCurrentlyOverlapping = true;
      }
      this.totalOverlapMs += ANALYSIS_INTERVAL_MS;
      this.state.overlapDurationMs = now - this.overlapStartTime;
    } else {
      if (this.isCurrentlyOverlapping) {
        this.isCurrentlyOverlapping = false;
        this.state.overlapDurationMs = 0;
      }
    }

    this.state.isOverlapping = bothActive;
    this.state.sessionOverlapSeconds = this.totalOverlapMs / 1000;

    // Chaos metrics
    const overlapRatio =
      this.totalSamplesInWindow > 0
        ? this.overlapSamplesInWindow / this.totalSamplesInWindow
        : 0;

    const chaosScore = Math.min(
      100,
      Math.round(
        40 * overlapRatio +
        30 * Math.min(this.state.sessionInterruptions / 10, 1) +
        30 * Math.min(this.state.sessionShoutSpikes / 5, 1)
      )
    );

    this.state.metrics = {
      overlapRatio,
      interruptionsCount: this.state.sessionInterruptions,
      shoutSpikesCount: this.state.sessionShoutSpikes,
      chaosScore,
    };

    // Shield actions
    this.applyShieldActions(now);

    // Focus prompt check
    this.checkFocusPrompt(now);

    this.onUpdate?.(structuredClone(this.state));
  }

  private applyShieldActions(now: number) {
    // Dynamic leveling
    for (let i = 0; i < 2; i++) {
      if (!this.gainNodes[i]) continue;
      const db = this.state.speakers[i].rmsDb;
      const target = this.policy.levelingTargetDb;
      if (db > target + 3 && db > -60) {
        const reduction = Math.min((db - target) * 0.01, 0.05);
        this.gainNodes[i]!.gain.value = Math.max(0.1, this.gainNodes[i]!.gain.value - reduction);
      } else if (this.gainNodes[i]!.gain.value < 1.0) {
        this.gainNodes[i]!.gain.value = Math.min(1.0, this.gainNodes[i]!.gain.value + 0.01);
      }
    }

    // Overlap ducking
    if (this.isCurrentlyOverlapping && this.state.overlapDurationMs > this.policy.overlapTriggerMs) {
      const dbA = this.state.speakers[0].rmsDb;
      const dbB = this.state.speakers[1].rmsDb;
      const duckIdx = dbA >= dbB ? 1 : 0;
      if (this.gainNodes[duckIdx]) {
        const targetGain = 1 - this.policy.duckingStrength;
        this.gainNodes[duckIdx]!.gain.value = Math.max(
          targetGain,
          this.gainNodes[duckIdx]!.gain.value - 0.02
        );
      }
    }

    // Toast cue
    if (
      this.isCurrentlyOverlapping &&
      this.state.overlapDurationMs > this.policy.tSec * 1000 &&
      now - this.lastToastTime > this.policy.toastCooldownMs
    ) {
      const dbA = this.state.speakers[0].rmsDb;
      const dbB = this.state.speakers[1].rmsDb;
      const dominant = dbA >= dbB ? "Speaker A" : "Speaker B";
      const other = dbA >= dbB ? "Speaker B" : "Speaker A";
      this.onToast?.(`Let ${dominant} finish before ${other} 🤫`);
      this.lastToastTime = now;
      this.state.toastCount++;
    }
  }

  private checkFocusPrompt(now: number) {
    if (this.focusPromptShown) return;

    if (this.state.metrics.chaosScore > this.policy.k) {
      if (this.chaosAboveKSince === 0) {
        this.chaosAboveKSince = now;
      } else if (now - this.chaosAboveKSince > this.FOCUS_PROMPT_DELAY_MS) {
        this.focusPromptShown = true;
        this.state.focusPromptsCount++;
        this.onFocusPrompt?.();
      }
    } else {
      this.chaosAboveKSince = 0;
    }
  }
}
