/**
 * The shape the daily-conversation role must return, and the validation that
 * keeps the docs' rules true even when the model does not: every outside
 * claim cites a loaded source, and three Places is a ceiling.
 */

export const PLACE_KINDS = ["learn", "hold", "respond", "create", "ask", "meet"];
export const MAX_DEVELOPMENTS = 3;
export const MAX_PLACES = 3;

const stringArray = { type: "array", items: { type: "string" } };

export const conversationSchema = {
  type: "object",
  additionalProperties: false,
  required: ["completion", "developments", "inside_reading", "places", "return_tomorrow", "honest_note"],
  properties: {
    completion: {
      type: "object", additionalProperties: false, required: ["status", "blocker"],
      properties: { status: { type: "string", enum: ["completed", "partial"] }, blocker: { type: ["string", "null"] } },
      description: "Report partial if synthesis is blocked. Zero developments can be completed only when a valid bounded review found nothing worth surfacing."
    },
    developments: {
      type: "array",
      description: "At most three outside developments that plausibly matter. Every claim must cite loaded source_item_ids.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "distillation", "source_item_ids", "disagreement", "why_it_matters"],
        properties: {
          title: { type: "string" },
          distillation: { type: "string", description: "A fair compression that preserves disagreement." },
          source_item_ids: { type: "array", items: { type: "string" }, minItems: 1 },
          disagreement: { type: ["string", "null"], description: "Where the cited people disagree, or null." },
          why_it_matters: { type: "string" },
        },
      },
    },
    inside_reading: {
      type: "object",
      additionalProperties: false,
      required: ["established_positions", "forming"],
      properties: {
        established_positions: stringArray,
        forming: stringArray,
      },
    },
    places: {
      type: "array",
      description: "Zero to three exact openings. Zero is a valid result.",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "title",
          "kind",
          "why_it_fits",
          "what_to_add",
          "human_time",
          "source_item_ids",
          "context_refs",
          "fit_requires_confirmation",
        ],
        properties: {
          title: { type: "string" },
          kind: { type: "string", enum: PLACE_KINDS },
          why_it_fits: { type: "string" },
          what_to_add: { type: "string" },
          human_time: { type: "string" },
          source_item_ids: { type: "array", items: { type: "string" }, minItems: 1 },
          context_refs: stringArray,
          fit_requires_confirmation: { type: "boolean" },
        },
      },
    },
    return_tomorrow: {
      type: "object",
      additionalProperties: false,
      required: ["watch", "open_question"],
      properties: {
        watch: stringArray,
        open_question: { type: ["string", "null"] },
      },
    },
    honest_note: {
      type: "string",
      description: "Coverage limits, missing viewpoints, and uncertainty, in one short paragraph.",
    },
  },
};

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function unknownSources(ids, known) {
  return asArray(ids).filter((id) => !known.has(id));
}

/**
 * Returns the conversation with violating items removed and a list of what was
 * dropped and why, so the run record can show the audit trail.
 */
export function validateConversation(output, sourceIds) {
  const known = new Set(sourceIds);
  const dropped = [];
  const developments = [];
  const places = [];

  asArray(output?.developments).forEach((development, index) => {
    const ids = asArray(development?.source_item_ids);
    const missing = unknownSources(ids, known);
    if (ids.length === 0 || missing.length > 0) {
      dropped.push({ kind: "development", index, title: development?.title ?? null, reason: `cites unknown or no sources: ${missing.join(", ") || "none"}` });
      return;
    }
    if (developments.length >= MAX_DEVELOPMENTS) {
      dropped.push({ kind: "development", index, title: development?.title ?? null, reason: "exceeds the ceiling of three developments" });
      return;
    }
    developments.push({ ...development, disagreement: development.disagreement ?? null });
  });

  asArray(output?.places).forEach((place, index) => {
    const ids = asArray(place?.source_item_ids);
    const missing = unknownSources(ids, known);
    if (ids.length === 0 || missing.length > 0) {
      dropped.push({ kind: "place", index, title: place?.title ?? null, reason: `cites unknown or no sources: ${missing.join(", ") || "none"}` });
      return;
    }
    if (!PLACE_KINDS.includes(place?.kind)) {
      dropped.push({ kind: "place", index, title: place?.title ?? null, reason: `unknown place kind ${JSON.stringify(place?.kind)}` });
      return;
    }
    if (places.length >= MAX_PLACES) {
      dropped.push({ kind: "place", index, title: place?.title ?? null, reason: "exceeds the ceiling of three places" });
      return;
    }
    places.push({
      ...place,
      context_refs: asArray(place.context_refs),
      fit_requires_confirmation: Boolean(place.fit_requires_confirmation),
    });
  });

  return {
    conversation: {
      developments,
      inside_reading: {
        established_positions: asArray(output?.inside_reading?.established_positions),
        forming: asArray(output?.inside_reading?.forming),
      },
      places,
      return_tomorrow: {
        watch: asArray(output?.return_tomorrow?.watch),
        open_question: output?.return_tomorrow?.open_question ?? null,
      },
      honest_note: typeof output?.honest_note === "string" ? output.honest_note : "",
    },
    dropped,
  };
}
