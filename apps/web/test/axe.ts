import type { AxeResults } from "axe-core";

/**
 * spec 39절 DoD: "접근성 자동검사 critical 0건". axe-core's own default
 * matcher checks every impact level; this narrows to what the spec actually
 * requires so a "moderate" finding doesn't fail this gate (it's still
 * visible in `results.violations` for manual triage).
 */
export function criticalViolations(results: AxeResults) {
  return results.violations.filter((v) => v.impact === "critical");
}
