import { describe, expect, it } from "vitest";
import { supportsTemperature } from "../src/model-capabilities";

describe("supportsTemperature", () => {
  it("gpt-5 계열(reasoning model)은 temperature를 지원하지 않는다", () => {
    expect(supportsTemperature("gpt-5-nano")).toBe(false);
    expect(supportsTemperature("gpt-5-mini")).toBe(false);
    expect(supportsTemperature("gpt-5")).toBe(false);
  });

  it("o1/o3/o4 계열(reasoning model)은 temperature를 지원하지 않는다", () => {
    expect(supportsTemperature("o1-mini")).toBe(false);
    expect(supportsTemperature("o3")).toBe(false);
    expect(supportsTemperature("o4-mini")).toBe(false);
  });

  it("일반 모델(gpt-4.1 등)은 temperature를 지원한다", () => {
    expect(supportsTemperature("gpt-4.1")).toBe(true);
    expect(supportsTemperature("gpt-4.1-mini")).toBe(true);
    expect(supportsTemperature("gpt-4o")).toBe(true);
    expect(supportsTemperature("test-model")).toBe(true);
  });
});
