import { describe, expect, it } from "vitest";
import { extractResponseOutputText } from "../src/responses-api";

describe("extractResponseOutputText", () => {
  it("일반 모델처럼 output[0]이 바로 message면 그 text를 반환한다", () => {
    const body = {
      output: [{ type: "message", content: [{ type: "output_text", text: "hello" }] }],
    };
    expect(extractResponseOutputText(body)).toBe("hello");
  });

  it("reasoning 모델처럼 output[0]이 reasoning이고 output[1]이 message여도 text를 찾아낸다 (gpt-5-nano에서 실제 확인)", () => {
    const body = {
      output: [
        { type: "reasoning", content: [] },
        { type: "message", content: [{ type: "output_text", text: "42" }] },
      ],
    };
    expect(extractResponseOutputText(body)).toBe("42");
  });

  it("message 항목이 없으면 undefined를 반환한다", () => {
    const body = { output: [{ type: "reasoning", content: [] }] };
    expect(extractResponseOutputText(body)).toBeUndefined();
  });

  it("output이 배열이 아니거나 없으면 undefined를 반환한다", () => {
    expect(extractResponseOutputText({})).toBeUndefined();
    expect(extractResponseOutputText(null)).toBeUndefined();
    expect(extractResponseOutputText({ output: "not-an-array" })).toBeUndefined();
  });

  it("output_text가 아닌 content 항목만 있으면 undefined를 반환한다", () => {
    const body = { output: [{ type: "message", content: [{ type: "refusal", text: "no" }] }] };
    expect(extractResponseOutputText(body)).toBeUndefined();
  });
});
