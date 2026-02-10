import { MetricsAndScores, Recommendation } from "./types";

export function generateRecommendations(
  data: MetricsAndScores,
): Recommendation[] {
  const recs: Recommendation[] = [];

  const contrastScore = data.subscores.contrast_color;
  const clutterScore = data.subscores.clutter;
  const readabilityScore = data.subscores.readability;

  if (contrastScore < 70) {
    recs.push({
      id: "increase_contrast",
      message:
        "Increase text/background contrast (target ≥ 4.5:1) to improve readability at a glance.",
      expectedGain: 10,
      rationale:
        "Contrast proxy from luminance variation is below the recommended threshold.",
    });
  }

  if (clutterScore < 65) {
    recs.push({
      id: "reduce_clutter",
      message:
        "Reduce background details and simplify layout around key messaging.",
      expectedGain: 8,
      rationale:
        "Edge density suggests a visually busy composition that can compete with key text elements.",
    });
  }

  if (data.metricsRaw.orientation === "horizontal") {
    recs.push({
      id: "billboard_orientation_defaults",
      message:
        "Layout appears horizontal; billboard viewing defaults (5.5m height, ~40km/h) were applied.",
      expectedGain: 5,
      rationale:
        "Orientation indicates a landscape format typical for roadside billboards.",
    });
  }

  recs.push({
    id: "assumptions_traffic",
    message:
      "Assumptions used: structure height 5.5m, average traffic speed 40km/h, primary viewing angle ~45° at 15m.",
    expectedGain: 5,
    rationale:
      "Clarifying assumptions helps align creative decisions with the deployment context.",
  });

  if (readabilityScore < 70) {
    recs.push({
      id: "focus_message",
      message:
        "Prioritize one clear primary message with minimal supporting copy for drive-by environments.",
      expectedGain: 12,
      rationale:
        "Combined clutter and contrast proxies indicate potential overload for short contact times.",
    });
  }

  // cap at top 5 by expectedGain
  return recs
    .sort((a, b) => b.expectedGain - a.expectedGain)
    .slice(0, 5);
}

