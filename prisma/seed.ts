import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEFAULT_POLICY = {
  k: 60,
  tSec: 1.5,
  overlapTriggerMs: 600,
  duckingStrength: 0.5,
  levelingTargetDb: -22,
  shoutDeltaDb: 12,
  toastCooldownMs: 30000,
  learningEnabled: true,
};

async function main() {
  // Only seed if no policy exists
  const existing = await prisma.policy.findFirst();
  if (existing) {
    console.log("Policy already exists, skipping seed.");
    return;
  }

  await prisma.policy.create({
    data: {
      version: 1,
      policyJson: DEFAULT_POLICY,
      explanation: "Default policy — no learning applied yet.",
    },
  });

  console.log("Seeded default policy v1.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
