import { Assumptions, MetricsAndScores, Orientation, RawMetrics, Subscores } from "./types";

export interface BuildMetricsAndScoresOptions {
  raw: RawMetrics;
}

function mapStdLumaToContrastScore(stdLuma: number): number {
  // Heuristic: 0.0 => 10, 0.25 => 60, 0.5+ => 95 (clamped)
  const clamped = Math.max(0, Math.min(0.5, stdLuma));
  const score = 10 + (clamped / 0.5) * (95 - 10);
  return Math.max(0, Math.min(100, score));
}

function mapEdgeDensityToClutterScore(edgeDensity: number): number {
  // More edges => more clutter => lower score.
  // Assume edgeDensity 0.05 => 90, 0.3 => 60, 0.6+ => 25
  const ed = Math.max(0, Math.min(0.6, edgeDensity));
  const t = ed / 0.6;
  const score = 90 * (1 - t) + 25 * t;
  return Math.max(0, Math.min(100, score));
}

function mapColorfulnessToScore(colorfulness: number): number {
  // Heuristic mapping approx 0..0.5 => 20..60, 1.0+ => 85
  const cf = Math.max(0, Math.min(1.0, colorfulness));
  const score = 20 + cf * (85 - 20);
  return Math.max(0, Math.min(100, score));
}

function deriveStatus(overallScore: number): "needs_work" | "ok" | "excellent" {
  if (overallScore >= 80) return "excellent";
  if (overallScore >= 60) return "ok";
  return "needs_work";
}

export function buildMetricsAndScores(
  opts: BuildMetricsAndScoresOptions,
): MetricsAndScores {
  const { raw } = opts;

  const contrastScore = mapStdLumaToContrastScore(raw.imageStats.stdLuma);
  const clutterScore = mapEdgeDensityToClutterScore(raw.edgeDensity);
  const colorScore = mapColorfulnessToScore(raw.imageStats.colorfulness);

  const readabilityScore = 0.6 * contrastScore + 0.4 * clutterScore;

  const subscores: Subscores = {
    readability: Math.round(readabilityScore),
    contrast_color: Math.round(0.7 * contrastScore + 0.3 * colorScore),
    clutter: Math.round(clutterScore),
    visual_hierarchy: 60,
    cta_qr: 60,
    brand: 60,
    contact_time_fit: 60,
    legal_compliance: 60,
  };

  const overallScore = Math.round(readabilityScore);
  const status = deriveStatus(overallScore);

  const assumptions: Assumptions = {
    defaults: {
      structureHeightM: 5.5,
      avgVehicleSpeedKmh: 40,
      viewpoints: [
        {
          angleDeg: 45,
          distanceM: 15,
          speedKmh: 40,
        },
      ],
    },
    notImplemented: [
      "true OCR-based text detection",
      "full visual hierarchy analysis",
      "brand asset detection",
      "QR/CTA legibility model",
      "legal small-print compliance model",
    ],
  };

  const metricsAndScores: MetricsAndScores = {
    overallScore,
    status,
    subscores,
    metricsRaw: raw,
    assumptions,
    recommendations: [], // populated later
  };

  return metricsAndScores;
}

export function deriveOrientation(
  width: number,
  height: number,
): Orientation {
  const ratio = width / height;
  if (ratio > 1.1) return "horizontal";
  if (ratio < 0.9) return "vertical";
  return "square";
}

