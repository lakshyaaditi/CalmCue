-- CalmCue / Lightdash SQL Runner Queries
-- Connect Lightdash to Postgres (DATABASE_URL) and paste these into SQL Runner.

-- ============================================================
-- 1) Sessions over time — reward trend
-- ============================================================
SELECT
  DATE(created_at) AS session_date,
  COUNT(*) AS session_count,
  ROUND(AVG(reward)::numeric, 2) AS avg_reward,
  ROUND(MIN(reward)::numeric, 2) AS min_reward,
  ROUND(MAX(reward)::numeric, 2) AS max_reward
FROM sessions
GROUP BY DATE(created_at)
ORDER BY session_date;


-- ============================================================
-- 2) Average overlap seconds per policy version
-- ============================================================
SELECT
  policy_version_used,
  COUNT(*) AS sessions,
  ROUND(AVG((metrics_json->>'overlapSeconds')::numeric)::numeric, 2) AS avg_overlap_seconds,
  ROUND(AVG((metrics_json->>'interruptionsCount')::numeric)::numeric, 1) AS avg_interruptions,
  ROUND(AVG((metrics_json->>'shoutSpikesCount')::numeric)::numeric, 1) AS avg_shout_spikes,
  ROUND(AVG(reward)::numeric, 2) AS avg_reward
FROM sessions
GROUP BY policy_version_used
ORDER BY policy_version_used;


-- ============================================================
-- 3) Before vs after — compare first run vs second run
-- ============================================================
WITH ranked AS (
  SELECT
    *,
    ROW_NUMBER() OVER (ORDER BY created_at) AS run_number
  FROM sessions
)
SELECT
  CASE WHEN run_number = 1 THEN 'First Run' ELSE 'Second Run' END AS run_label,
  policy_version_used,
  reward,
  (metrics_json->>'overlapSeconds')::numeric AS overlap_seconds,
  (metrics_json->>'interruptionsCount')::numeric AS interruptions,
  (metrics_json->>'shoutSpikesCount')::numeric AS shout_spikes,
  (metrics_json->>'toastCount')::numeric AS toast_count,
  (metrics_json->>'focusPromptsCount')::numeric AS focus_prompts,
  (metrics_json->>'overloadScore')::numeric AS overload_score,
  (metrics_json->>'annoyanceScore')::numeric AS annoyance_score
FROM ranked
WHERE run_number <= 2
ORDER BY run_number;
