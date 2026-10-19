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
          completion: { status: "completed", blocker: null },
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

/**
 * The Monday draft's stand-in. It drafts from the first unused seed it is
 * handed, in the shape the real prompt asks for, so the folder layout, the
 * checks and the note can be exercised offline.
 */
export function fixtureWeeklyProvider() {
  return {
    name: "fixture",
    model: "fixture-v1",
    async converse({ seeds = [] }) {
      const usage = { input_tokens: 0, output_tokens: 0, note: "fixture provider; no tokens were spent" };
      const seed = seeds[0];
      if (!seed) {
        return {
          stop_reason: "end_turn",
          usage,
          output: {
            decision: "nothing_this_week",
            reason: "No unused seed had enough facts to carry a piece.",
            seed: { source: "none", backlog_number: null, title: "none" },
            slug: "nothing",
            essay: null,
            posts: null,
            you_add: [],
            note: "Add a seed to notes/story-backlog.md when something from the week is worth telling.",
          },
        };
      }
      const paragraph = `${seed.facts ?? "The work moved this week."} This is the part the commits can show.`;
      const body = [
        "## What happened",
        "",
        paragraph,
        "",
        "[YOU ADD: why this mattered to you]",
        "",
        ...Array.from({ length: 6 }, () => `${paragraph} It is written plainly so the sample stays readable, and so the essay is long enough to pass the length check on its own.`),
        "",
        "## What I'd tell someone else",
        "",
        "[YOU ADD: what you believe now]",
        "",
        "If you've built something like this, tell me what you tried.",
        "",
        "Tony",
        "",
        "*Made with Agents for Introverts. My agent helped shape this version. The experience and point of view are mine.*",
      ].join("\n");
      return {
        stop_reason: "end_turn",
        usage,
        output: {
          decision: "draft",
          reason: `Seed ${seed.number} has the clearest facts.`,
          seed: { source: "backlog", backlog_number: seed.number, title: seed.title },
          slug: seed.title,
          essay: { title: seed.title, subtitle: "A sample draft from the offline fixture.", body_markdown: body },
          posts: {
            linkedin: `${seed.title}.\n\n${seed.facts ?? ""}\n\n[YOU ADD: the decision behind it]\n\nWhat would you have done?\n\n[LINK]\n\nMade with Agents for Introverts. The experience and point of view are mine; my agent helped shape this version.`,
            x: [`${seed.title}.`, "[YOU ADD: the one example]", "What would you have done?\n\nFull story: [LINK]\n\nMade with Agents for Introverts. My agent helped shape this version."],
            threads: `${seed.title}. [YOU ADD: how it felt]\n\nWhat are you building?\n\n[LINK]\n\nMade with Agents for Introverts. The point of view is mine; my agent helped shape this.`,
          },
          you_add: ["Why this mattered to you", "What you believe now"],
          note: `I drafted seed ${seed.number}, "${seed.title}". The two [YOU ADD] lines are yours.`,
        },
      };
    },
  };
}
