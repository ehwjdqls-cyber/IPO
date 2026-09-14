/**
 * Extracts the structured-output text from an OpenAI Responses API body.
 * Reasoning models (o1/o3/o4, gpt-5 line) prepend a `type: "reasoning"`
 * item (empty `content`) to `output` before the actual `type: "message"`
 * item -- confirmed live against gpt-5-nano, whose real response shape is
 * `output: [{type:"reasoning", content: []}, {type:"message", content:
 * [{type:"output_text", text: "..."}]}]`. Indexing output[0] directly (as
 * non-reasoning models' single-item output allowed) grabs the empty
 * reasoning item instead and silently yields undefined text. Searching
 * for the message item by type works for both model families.
 */
export function extractResponseOutputText(body: unknown): string | undefined {
  const output = (body as { output?: unknown })?.output;
  if (!Array.isArray(output)) return undefined;
  const messageItem = output.find(
    (item): item is { content?: unknown } =>
      typeof item === "object" && item !== null && (item as { type?: unknown }).type === "message"
  );
  const content = messageItem?.content;
  if (!Array.isArray(content)) return undefined;
  const textItem = content.find(
    (c): c is { text?: unknown } =>
      typeof c === "object" && c !== null && (c as { type?: unknown }).type === "output_text"
  );
  const text = textItem?.text;
  return typeof text === "string" ? text : undefined;
}
