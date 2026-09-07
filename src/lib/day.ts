/**
 * The public shape of one day of the practice: what the site renders and what
 * `services/runner/export-public.mjs` writes once Tony approves a day. The
 * schema name is shared with the runner; keep the two in step.
 */

export type SourceDoor = { label: string; url: string };

export type OutsideDevelopment = {
  surface: string;
  distillation: string;
  sources: SourceDoor[];
  disagreement: string | null;
};

export type Inside = {
  text: string;
  authored_by: "human";
  mode_label: string;
};

export type ContextBasis = "explicit" | "observed" | "inferred";

export type ContextUsed = { basis: ContextBasis; label: string };

export type PlaceKind = "learn" | "hold" | "respond" | "create" | "ask" | "meet";

export type Place = {
  index: number;
  kind: PlaceKind;
  title: string;
  fit: string;
  status: "surfaced" | "held" | "draft ready";
};

export type Day = {
  schema: "afi.public_day.v1";
  date: string;
  weekday: string;
  example: boolean;
  mode: "short" | "deep" | "no_new_input";
  outside: OutsideDevelopment[];
  inside: Inside | null;
  context_used: ContextUsed[];
  places: Place[];
  held_note: string | null;
  nothing_sent: true;
  generated_at: string;
  run_id: string;
};

export const MAX_PLACES = 3;
export const MAX_OUTSIDE = 3;

const PLACE_KINDS: readonly PlaceKind[] = ["learn", "hold", "respond", "create", "ask", "meet"];
const BASES: readonly ContextBasis[] = ["explicit", "observed", "inferred"];
const MODES = ["short", "deep", "no_new_input"] as const;
const STATUSES = ["surfaced", "held", "draft ready"] as const;

function fail(message: string): never {
  throw new Error(`public day: ${message}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) fail(`${field} must be a non-empty string`);
  return value;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], field: string): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    fail(`${field} must be one of ${allowed.join(", ")}`);
  }
  return value as T;
}

function parseSource(value: unknown, field: string): SourceDoor {
  if (!isRecord(value)) fail(`${field} must be an object`);
  const url = str(value.url, `${field}.url`);
  if (!url.startsWith("https://")) fail(`${field}.url must be an https source door`);
  return { label: str(value.label, `${field}.label`), url };
}

function parseOutside(value: unknown, field: string): OutsideDevelopment {
  if (!isRecord(value)) fail(`${field} must be an object`);
  if (!Array.isArray(value.sources) || value.sources.length === 0) {
    fail(`${field} needs at least one source door`);
  }
  return {
    surface: str(value.surface, `${field}.surface`),
    distillation: str(value.distillation, `${field}.distillation`),
    sources: value.sources.map((s, i) => parseSource(s, `${field}.sources[${i}]`)),
    disagreement:
      value.disagreement === null || value.disagreement === undefined
        ? null
        : str(value.disagreement, `${field}.disagreement`),
  };
}

function parsePlace(value: unknown, field: string): Place {
  if (!isRecord(value)) fail(`${field} must be an object`);
  if (typeof value.index !== "number") fail(`${field}.index must be a number`);
  return {
    index: value.index,
    kind: oneOf(value.kind, PLACE_KINDS, `${field}.kind`),
    title: str(value.title, `${field}.title`),
    fit: str(value.fit, `${field}.fit`),
    status: oneOf(value.status, STATUSES, `${field}.status`),
  };
}

export function parseDay(value: unknown): Day {
  if (!isRecord(value)) fail("must be an object");
  if (value.schema !== "afi.public_day.v1") fail("schema must be afi.public_day.v1");

  if (!Array.isArray(value.outside)) fail("outside must be an array");
  if (value.outside.length > MAX_OUTSIDE) fail(`outside may hold at most ${MAX_OUTSIDE} developments`);

  if (!Array.isArray(value.places)) fail("places must be an array");
  if (value.places.length > MAX_PLACES) fail(`places may hold at most ${MAX_PLACES} entries`);

  if (value.nothing_sent !== true) fail("nothing_sent must be true: a public day never sends");

  let inside: Inside | null = null;
  if (value.inside !== null && value.inside !== undefined) {
    if (!isRecord(value.inside)) fail("inside must be an object or null");
    if (value.inside.authored_by !== "human") fail("inside.authored_by must be human");
    inside = {
      text: str(value.inside.text, "inside.text"),
      authored_by: "human",
      mode_label: str(value.inside.mode_label, "inside.mode_label"),
    };
  }

  const contextRaw = Array.isArray(value.context_used) ? value.context_used : [];

  return {
    schema: "afi.public_day.v1",
    date: str(value.date, "date"),
    weekday: str(value.weekday, "weekday"),
    example: value.example === true,
    mode: oneOf(value.mode, MODES, "mode"),
    outside: value.outside.map((o, i) => parseOutside(o, `outside[${i}]`)),
    inside,
    context_used: contextRaw.map((c, i) => {
      if (!isRecord(c)) fail(`context_used[${i}] must be an object`);
      return {
        basis: oneOf(c.basis, BASES, `context_used[${i}].basis`),
        label: str(c.label, `context_used[${i}].label`),
      };
    }),
    places: value.places.map((p, i) => parsePlace(p, `places[${i}]`)),
    held_note:
      value.held_note === null || value.held_note === undefined ? null : str(value.held_note, "held_note"),
    nothing_sent: true,
    generated_at: str(value.generated_at, "generated_at"),
    run_id: str(value.run_id, "run_id"),
  };
}

/**
 * The example day the site ships with until a real, approved day replaces
 * `src/content/day.json`. Every source door is a real public page from the
 * bootstrap corpus in docs/research; the distillations are illustrative.
 */
export const exampleDay: Day = {
  schema: "afi.public_day.v1",
  date: "2026-09-03",
  weekday: "Thursday",
  example: true,
  mode: "short",
  outside: [
    {
      surface: "research · two papers, one position",
      distillation:
        "Agents that act for you. Most agree an agent should draft and report back. They split on whether it should ever press send.",
      sources: [
        {
          label: "Dittos: reciprocal agents in AI-mediated communication",
          url: "https://www.microsoft.com/en-us/research/publication/dittos-mimetic-reciprocal-agents-in-ai-mediated-communication/",
        },
        { label: "What do AI agents talk about?", url: "https://arxiv.org/abs/2603.07880" },
      ],
      disagreement: "Proxy activity can become ritual noise. Relational continuity is not the same as more posts.",
    },
    {
      surface: "founders · resurfaced twice this month",
      distillation:
        "Distribution is the wall. One thread argues useful replies in the right room beat broad posting. The reply argues public founder discourse is the wrong room for most buyers.",
      sources: [
        {
          label: "I can build anything. Distribution is the wall I keep hitting.",
          url: "https://www.indiehackers.com/post/i-can-build-anything-distribution-is-the-wall-i-keep-hitting-694cd7f9bc",
        },
        {
          label: "Build in public is a distribution strategy for founders selling to founders",
          url: "https://www.indiehackers.com/post/build-in-public-is-a-distribution-strategy-for-founders-selling-to-founders-11f31744e4",
        },
      ],
      disagreement: "Presence in a community and demand from it are different things.",
    },
    {
      surface: "feeds · a design vocabulary",
      distillation:
        "Feeds are legible if you look. One piece names how selection and ranking work; another argues choosing your own feed restores agency.",
      sources: [
        {
          label: "Into the driver's seat with social media content feeds",
          url: "https://knightcolumbia.org/content/into-the-drivers-seat-with-social-media-content-feeds",
        },
        { label: "Algorithmic choice with custom feeds", url: "https://bsky.social/about/blog/7-27-2023-custom-feeds" },
      ],
      disagreement: null,
    },
  ],
  inside: {
    text:
      "Wired the subscribe endpoint. Deleted the seven-second opening; the page starts settled now. Avoided the Woon essay again. Noticed I keep explaining the human line to people who did not ask.",
    authored_by: "human",
    mode_label: "short version",
  },
  context_used: [
    { basis: "explicit", label: "building Agents for Introverts" },
    { basis: "explicit", label: "Woon, an iMessage agent, 2023" },
    { basis: "inferred", label: "avoids launch days" },
  ],
  places: [
    {
      index: 1,
      kind: "respond",
      title: "Reply to the send-button thread.",
      fit: "You built the line they are arguing about, and you have a position on it.",
      status: "draft ready",
    },
    {
      index: 2,
      kind: "learn",
      title: "Read the distribution thread before adding anything.",
      fit: "Two people you have replied to before are describing the practice you use. Neither mentioned agents.",
      status: "held",
    },
  ],
  held_note: "No third place today. The launch-day thread is loud, not yours. Left it.",
  nothing_sent: true,
  generated_at: "2026-09-03T12:00:00Z",
  run_id: "example",
};
