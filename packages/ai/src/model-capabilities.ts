/**
 * OpenAI's reasoning model families (o1/o3/o4, the gpt-5 line) reject the
 * `temperature` request parameter outright (400 "Unsupported parameter")
 * -- found live when this project's only available generation model
 * turned out to be gpt-5-nano. Non-reasoning models (gpt-4.1, gpt-4o,
 * etc.) still want temperature set per spec 22절's fixed defaults
 * (질문 생성 0.3, 답변 생성 0.1), so this can't be dropped unconditionally.
 */
const REASONING_MODEL_PREFIXES = ["o1", "o3", "o4", "gpt-5"];

export function supportsTemperature(model: string): boolean {
  return !REASONING_MODEL_PREFIXES.some((prefix) => model.startsWith(prefix));
}
