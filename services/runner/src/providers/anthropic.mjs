/**
 * The Claude provider. One bounded call: the assembled system prompt, one user
 * turn carrying the rendered runtime context, the source sheet, and Tony's
 * capture, and a JSON schema the answer must match.
 *
 * Credentials come from the environment or an `ant auth login` profile; the
 * runner never reads or stores a key itself, and nothing here can call a tool.
 */

import Anthropic from "@anthropic-ai/sdk";

export const DEFAULT_MODEL = "claude-opus-5";

export function anthropicProvider({ model = DEFAULT_MODEL, client = new Anthropic() } = {}) {
  return {
    name: "anthropic",
    model,
    async converse({ system, user, schema }) {
      // Streaming keeps a long, high-effort answer clear of HTTP timeouts.
      const stream = client.messages.stream({
        model,
        max_tokens: 16000,
        system,
        thinking: { type: "adaptive" },
        output_config: { effort: "high", format: { type: "json_schema", schema } },
        messages: [{ role: "user", content: user }],
      });
      const message = await stream.finalMessage();

      const text = message.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("");

      let output = null;
      if (message.stop_reason === "end_turn" && text.trim()) {
        try {
          output = JSON.parse(text);
        } catch {
          output = null;
        }
      }

      return {
        stop_reason: message.stop_reason,
        stop_details: message.stop_details ?? null,
        usage: message.usage,
        output,
      };
    },
  };
}
