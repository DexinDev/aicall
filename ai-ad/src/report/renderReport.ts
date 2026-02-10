import fs from "fs/promises";
import path from "path";
import puppeteer from "puppeteer";
import { ResultJson } from "../tools/result";

export interface RenderReportPdfOptions {
  jobDir: string;
  previewPath: string;
  resultPath: string;
  reportPath: string;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export async function renderReportPdf(
  opts: RenderReportPdfOptions,
): Promise<void> {
  const [htmlTemplate, css, resultBuf, previewBuf] = await Promise.all([
    fs.readFile(path.join(process.cwd(), "templates", "report.html"), "utf-8"),
    fs.readFile(path.join(process.cwd(), "templates", "report.css"), "utf-8"),
    fs.readFile(opts.resultPath, "utf-8"),
    fs.readFile(opts.previewPath),
  ]);

  const result: ResultJson = JSON.parse(resultBuf);

  const previewDataUrl = `data:image/png;base64,${previewBuf.toString(
    "base64",
  )}`;

  const subscoresRows = Object.entries(result.subscores)
    .map(
      ([key, value]) =>
        `<tr><td>${escapeHtml(key)}</td><td>${value}</td></tr>`,
    )
    .join("\n");

  const recommendationsList = result.recommendations
    .map(
      (r) =>
        `<li><strong>${escapeHtml(
          r.message,
        )}</strong><br/><span class="recommendation-meta">Expected gain: +${
          r.expectedGain
        } pts — ${escapeHtml(r.rationale)}</span></li>`,
    )
    .join("\n");

  const assumptionsList = [
    `Structure height: ${result.assumptions.defaults.structureHeightM} m`,
    `Avg vehicle speed: ${result.assumptions.defaults.avgVehicleSpeedKmh} km/h`,
    `Viewpoint: angle ${result.assumptions.defaults.viewpoints[0].angleDeg}°, distance ${result.assumptions.defaults.viewpoints[0].distanceM} m`,
  ]
    .map((t) => `<li>${escapeHtml(t)}</li>`)
    .join("\n");

  const statusLabel =
    result.status === "excellent"
      ? "Excellent"
      : result.status === "ok"
      ? "Good"
      : "Needs work";

  const html = htmlTemplate
    .replace("{{REPORT_CSS}}", `<style>${css}</style>`)
    .replace("{{TITLE}}", "OOH Creative Analyzer Report")
    .replace("{{FILE_NAME}}", escapeHtml(result.inputSummary.fileName))
    .replace("{{OVERALL_SCORE}}", String(result.overallScore))
    .replace("{{STATUS_LABEL}}", escapeHtml(statusLabel))
    .replace("{{STATUS_RAW}}", escapeHtml(result.status))
    .replace("{{ORIENTATION}}", escapeHtml(result.metricsRaw.orientation))
    .replace(
      "{{DIMENSIONS}}",
      `${result.inputSummary.widthPx}×${result.inputSummary.heightPx}px`,
    )
    .replace("{{PREVIEW_DATA_URL}}", previewDataUrl)
    .replace("{{SUBSCORE_ROWS}}", subscoresRows)
    .replace("{{RECOMMENDATIONS_LIST}}", recommendationsList)
    .replace("{{ASSUMPTIONS_LIST}}", assumptionsList)
    .replace("{{APP_VERSION}}", escapeHtml(result.versions.app))
    .replace(
      "{{LIB_VERSIONS}}",
      escapeHtml(
        `sharp ${result.versions.libs.sharp}, puppeteer ${result.versions.libs.puppeteer}`,
      ),
    )
    .replace("{{SCHEMA_ID}}", escapeHtml(result.versions.schemaId));

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  } as any);

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    await page.emulateMediaType("screen");

    await page.pdf({
      path: opts.reportPath,
      format: "A4",
      printBackground: true,
      margin: { top: "16mm", right: "16mm", bottom: "16mm", left: "16mm" },
    });
  } finally {
    await browser.close();
  }
}

