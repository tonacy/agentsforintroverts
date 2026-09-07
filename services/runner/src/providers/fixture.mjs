/**
 * A deterministic stand-in for a model. It cites the real source ids it is
 * handed, so the whole pipeline can be exercised without a network or a key.
 */
export function fixtureProvider() {
  return {
    name: "fixture",
    model: "fixture-v1",
    async converse({ sourceIds, positions }) {
      const [first, second = first] = sourceIds;
      const position = positions?.[0] ?? "an established position";
      return {
        stop_reason: "end_turn",
        usage: { input_tokens: 0, output_tokens: 0, note: "fixture provider; no tokens were spent" },
        output: {
          developments: [
            {
              title: "Agents that post for you",
              distillation:
                "Most of the cited writing agrees an agent should draft. It splits on whether an agent should ever press send.",
              source_item_ids: [first],
              disagreement: "Drafting is common ground; sending is not.",
              why_it_matters: "It is the line Tony has already drawn.",
            },
            {
              title: "Shipping without a launch day",
              distillation: "One reply argues silence is a luxury only the already-known can afford.",
              source_item_ids: [second],
              disagreement: null,
              why_it_matters: "It touches the distribution blind spot.",
            },
          ],
          inside_reading: {
            established_positions: [position],
            forming: ["Whether the essay title overclaims."],
          },
          places: [
            {
              title: "Read the send-button thread before replying",
              kind: "learn",
              why_it_fits: `It argues about exactly the line in “${position}”.`,
              what_to_add: "Nothing yet. Read the disagreement first.",
              human_time: "15 minutes",
              source_item_ids: [first],
              context_refs: [position],
              fit_requires_confirmation: false,
            },
            {
              title: "Hold the launch-day thread",
              kind: "hold",
              why_it_fits: "Relevant to the Woon story, but loud and not Tony's.",
              what_to_add: "Nothing today.",
              human_time: "0 minutes",
              source_item_ids: [second],
              context_refs: [],
              fit_requires_confirmation: true,
            },
          ],
          return_tomorrow: {
            watch: ["Whether the send-button thread gets a reply from someone who ships agents."],
            open_question: "Does the essay title overclaim?",
          },
          honest_note:
            "Two sources cannot establish recurrence across pockets. This is a fixture conversation for exercising the pipeline.",
        },
      };
    },
  };
}
