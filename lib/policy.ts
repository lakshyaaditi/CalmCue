export interface PolicyParams {
  k: number;              // focus chaos threshold 40..90
  tSec: number;           // overlap nudge threshold seconds 0.3..3.0
  overlapTriggerMs: number; // 200..1200
  duckingStrength: number;  // 0.2..0.9
  levelingTargetDb: number; // -28..-16
  shoutDeltaDb: number;     // 6..18
  toastCooldownMs: number;  // 10_000..60_000
  learningEnabled: boolean;
}

export const DEFAULT_POLICY: PolicyParams = {
  k: 60,
  tSec: 1.5,
  overlapTriggerMs: 600,
  duckingStrength: 0.5,
  levelingTargetDb: -22,
  shoutDeltaDb: 12,
  toastCooldownMs: 30000,
  learningEnabled: true,
};

const CLAMPS: Record<string, [number, number]> = {
  k: [40, 90],
  tSec: [0.3, 3.0],
  overlapTriggerMs: [200, 1200],
  duckingStrength: [0.2, 0.9],
  levelingTargetDb: [-28, -16],
  shoutDeltaDb: [6, 18],
  toastCooldownMs: [10000, 60000],
};

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function adjustPolicy(
  current: PolicyParams,
  tooAggressiveCount: number,
  tooWeakCount: number
): { updated: PolicyParams; explanation: string } {
  const net = tooWeakCount - tooAggressiveCount; // positive => too weak, negative => too aggressive
  if (net === 0) {
    return { updated: current, explanation: "No net feedback — policy unchanged." };
  }

  const direction = net > 0 ? 1 : -1; // 1 = make stronger, -1 = make weaker (less aggressive)
  const magnitude = Math.min(Math.abs(net), 3); // cap at 3 feedback units
  const pct = 0.10 * (magnitude / 3); // max 10% change

  const updated = { ...current };

  // Too weak (direction=1): decrease k, decrease tSec, increase duckingStrength, decrease toastCooldown
  // Too aggressive (direction=-1): increase k, increase tSec, decrease duckingStrength, increase toastCooldown
  updated.k = clamp(current.k - direction * current.k * pct, ...CLAMPS.k as [number, number]);
  updated.tSec = clamp(current.tSec - direction * current.tSec * pct, ...CLAMPS.tSec as [number, number]);
  updated.overlapTriggerMs = clamp(current.overlapTriggerMs - direction * current.overlapTriggerMs * pct, ...CLAMPS.overlapTriggerMs as [number, number]);
  updated.duckingStrength = clamp(current.duckingStrength + direction * current.duckingStrength * pct, ...CLAMPS.duckingStrength as [number, number]);
  updated.toastCooldownMs = clamp(current.toastCooldownMs - direction * current.toastCooldownMs * pct, ...CLAMPS.toastCooldownMs as [number, number]);

  const parts: string[] = [];
  if (direction === 1) {
    parts.push("Made shields more sensitive based on 'too weak' feedback.");
    parts.push(`Lowered chaos threshold (k: ${current.k.toFixed(0)}→${updated.k.toFixed(0)}),`);
    parts.push(`faster nudges (tSec: ${current.tSec.toFixed(2)}→${updated.tSec.toFixed(2)}),`);
    parts.push(`stronger ducking (${current.duckingStrength.toFixed(2)}→${updated.duckingStrength.toFixed(2)}).`);
  } else {
    parts.push("Made shields less aggressive based on 'too aggressive' feedback.");
    parts.push(`Raised chaos threshold (k: ${current.k.toFixed(0)}→${updated.k.toFixed(0)}),`);
    parts.push(`slower nudges (tSec: ${current.tSec.toFixed(2)}→${updated.tSec.toFixed(2)}),`);
    parts.push(`softer ducking (${current.duckingStrength.toFixed(2)}→${updated.duckingStrength.toFixed(2)}).`);
  }

  return { updated, explanation: parts.join(" ") };
}
