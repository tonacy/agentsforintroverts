/**
 * The opening, in one lit scene. The feed is a flotilla of paper slips riding
 * a slow swell in toward the visitor, the water drawn in ink like the site's
 * prints; a resting pointer stills the water and the slips make way. As the
 * visitor scrolls, the camera tilts down, the swell calms and the slips drift
 * apart, and the day's loose pages fall onto the still water they leave:
 * flexing, tilting into each swing, landing, and casting their shadows. Then
 * the crew flies in, lifts each page, and presses it into the piece, which
 * inks in section by section where each page went.
 *
 * The director (./director) decides what happens at each point of the
 * passage; springs and each page's own clock decide how it moves, so motion
 * always settles. Loaded on demand, only when WebGL and motion are welcome.
 */

import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DataTexture,
  DoubleSide,
  DynamicDrawUsage,
  Group,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Plane,
  PlaneGeometry,
  RGFormat,
  Raycaster,
  SRGBColorSpace,
  Scene,
  ShaderMaterial,
  UnsignedByteType,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderer,
  type Texture,
} from "three";

import { BOARDS, LOOSE_PAGES, boardKindFor, type BoardKind, type LoosePage } from "../passage";
import { PX, deskPlacements, droppedAt, seaAt, shotAt, standAt, viewOf, type DeskPlace } from "./director";
import { ASSEMBLY, PRINT_HEIGHT, READING_ORDER, SECTIONS, advanceTask, crewAt, planCrew, printPlacement, restHeight, type Crew } from "./crew";
import { advanceClock, fallPose } from "./fall";
import { buildRobot, robotKit, type Robot } from "./robot";
import { afloat, partSlip, scatterSlips, type Parting, type Slip } from "./slips";
import { stepSpring, type Spring } from "./springs";
import { SWELL_GLSL } from "./swell";
import { PAGE_SIZES, SLIP_CELL, drawFaces, drawPage, drawPrint, drawShadow, drawSlipAtlas, loadFonts, loadImage, readFonts } from "./textures";

export type Hero3D = {
  /** Advance and draw one frame. `progress` is the passage's scroll progress. */
  frame(now: number, progress: number): void;
  /** The visitor's pointer, in client pixels, or null when it leaves. */
  pointer(clientX: number | null, clientY: number | null): void;
  resize(): void;
  dispose(): void;
};

const PAPER = "#fdfbf7";
/** The deep green-black of the site's prints. */
const WATER_INK = "#1d3a30";

// The water: a grid, finer near the visitor, reaching past the horizon haze.
const WATER_X = 46;
const WATER_NEAR = 16;
const WATER_FAR = -92;
/** Still water sits a little below the desk, so shadows never fight it. */
const WATER_LEVEL = -0.03;
/** Spacing of the carved lines across the water, at their finest. */
const LINE_PITCH = 0.15;

// The flotilla.
const SLIP_COUNT = 720;
const SLIP_X = 34;
const SLIP_NEAR = 8;
const SLIP_FAR = -70;
const SLIP_W = 1;
const SLIP_H = SLIP_W * (SLIP_CELL.h / SLIP_CELL.w);
/** How fast the current carries the slips in, in world units a second. */
const FLOW = 0.55;
/** The map of the strokes at the slips' feet: coarse across, finer in depth. */
const MARKS_W = 256;
const MARKS_H = 512;
/** The patch of water the marks map covers: the flotilla's whole run. */
const MARKS_AREA = { x: -SLIP_X - 2, z: SLIP_FAR, width: (SLIP_X + 2) * 2, depth: SLIP_NEAR + 4 - SLIP_FAR };
/** How many of the water's lines a slip's marks reach toward the visitor. */
const MARK_LINES = 2.4;

const HAZE = /* glsl */ `
uniform float uHazeNear;
uniform float uHazeFar;
float hazeAt(float depth) {
  return 1.0 - smoothstep(uHazeNear, uHazeFar, depth);
}
`;

const STILL = /* glsl */ `
uniform float uTime;
uniform vec2 uPointer;
uniform float uWake;
uniform float uSpread;
uniform float uChannel;
float stillAt(vec2 p) {
  return calmAt(p, uPointer, uWake, uSpread, uChannel);
}
`;

const WATER_VERTEX = /* glsl */ `
${SWELL_GLSL}
${STILL}
uniform float uLevel;
varying vec2 vXZ;
varying float vDepth;

void main() {
  vec2 p = position.xz;
  float height = swell(p, uTime).x * stillAt(p);
  vec4 view = viewMatrix * vec4(p.x, uLevel + height, p.y, 1.0);
  vXZ = p;
  vDepth = -view.z;
  gl_Position = projectionMatrix * view;
}
`;

const WATER_FRAGMENT = /* glsl */ `
${SWELL_GLSL}
${STILL}
${HAZE}
uniform vec3 uInk;
uniform vec3 uPaper;
uniform float uPitch;
uniform float uPixelRatio;
uniform float uStand;
uniform sampler2D uMarks;
uniform vec4 uMarksArea;
const float MARK_LINES = ${MARK_LINES.toFixed(2)};
varying vec2 vXZ;
varying float vDepth;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

// Smooth noise along one carved line, so each line breaks in its own places.
float along(float line, float x) {
  float i = floor(x);
  float f = fract(x);
  return mix(hash(vec2(line, i)), hash(vec2(line, i + 1.0)), f * f * (3.0 - 2.0 * f));
}

void main() {
  vec2 p = vXZ;
  float still = stillAt(p);
  vec3 s = swell(p, uTime) * still;
  // Cut like a print: the backs of the waves, turned from the visitor, carve
  // dark; the faces rolling toward the visitor stay pale.
  float shade = clamp(0.4 + s.z * 4.0 - s.y * 0.5, 0.0, 1.0);

  // Where a slip floats, the water marks its line: a few short strokes at its
  // foot, each shorter than the last. r runs 1 at the slip down to 0 a couple
  // of lines toward the visitor; g is 1 under the slip's middle, 0 at its sides.
  vec2 mark = texture2D(uMarks, (p - uMarksArea.xy) * uMarksArea.zw).rg;
  float rank = (1.0 - mark.r) * MARK_LINES;
  float ripple = step(0.004, mark.r) * smoothstep(0.0, 0.1, mark.g - 0.3 * rank) * uStand;

  // Lines across the water at fixed depths, carried up and down by the swell.
  // Far off, every other line gives way so they never crowd into grey.
  float u = p.y / uPitch;
  float level = max(0.0, log2(fwidth(u) * 9.0 / uPixelRatio));
  float scale = exp2(floor(level));
  float v = u / scale;
  float index = floor(v + 0.5);
  float line = index * scale;
  float fw = fwidth(v);
  float dist = abs(v - index);

  // Dark water is cut in thick lines; lit crests in hairlines, broken often.
  // Still water keeps only a few long, thin strokes.
  float width = mix(0.06, 0.38, shade) * mix(0.3, 1.0, still) / scale;
  float gaps = mix(0.4, mix(0.5, 0.08, shade), still);
  float grain = along(line, p.x * 0.42 / sqrt(scale) + line * 0.37);
  width *= smoothstep(gaps, gaps + 0.26, grain);
  // The marks only ever add ink: in dark water they merge, in pale water they show.
  width = max(width, ripple * (0.22 - 0.05 * rank) * smoothstep(0.06, 0.24, grain) / scale);
  float kept = max(smoothstep(0.0, 0.05, mix(0.1, 1.04, still) - hash(vec2(line, 7.0))), ripple);
  float fading = 1.0 - mod(index, 2.0) * fract(level);

  // Never finer than a hairline: far lines stay drawn, only fainter.
  float drawn = max(width, fw * 0.5);
  float ink = (1.0 - smoothstep(drawn - fw * 0.5, drawn + fw * 0.5, dist)) * clamp(width / drawn, 0.4, 1.0) * step(0.0005, width);
  // Still water is only hinted at, and the nearest water lets the page breathe.
  float quiet = mix(0.3, 1.0, still) * mix(0.3, 1.0, smoothstep(3.0, 8.5, vDepth)) * mix(0.5, 1.0, uStand);
  ink *= kept * max(fading, ripple) * max(quiet, ripple) * hazeAt(vDepth);

  // Where the pointer rests, rings spread through the still water.
  vec2 off = p - uPointer;
  float r = length(off);
  float ringV = r / 0.34 - uTime * 0.8;
  float ringIndex = floor(ringV + 0.5);
  float ringFw = fwidth(ringV);
  float ringWidth = 0.07 * smoothstep(0.35, 0.9, along(ringIndex, atan(off.y, off.x) * 2.2 + 9.0));
  float ringDrawn = max(ringWidth, ringFw * 0.5);
  float ring = (1.0 - smoothstep(ringDrawn - ringFw * 0.5, ringDrawn + ringFw * 0.5, abs(ringV - ringIndex))) * clamp(ringWidth / ringDrawn, 0.4, 1.0);
  ring *= uWake * smoothstep(0.3, 0.8, r) * (1.0 - smoothstep(1.4, 2.5, r)) * hazeAt(vDepth);
  ink = max(ink, ring * 0.75);
  gl_FragColor = vec4(mix(uPaper, uInk, ink), 1.0);
  #include <colorspace_fragment>
}
`;

const SLIP_VERTEX = /* glsl */ `
${SWELL_GLSL}
${STILL}
${HAZE}
attribute vec3 aSpot;
attribute vec4 aLook;
uniform float uStand;
uniform float uLevel;
uniform vec2 uSize;
uniform vec2 uCells;
uniform float uColumns;
uniform vec3 uLight;
varying vec2 vUv;
varying float vLight;
varying float vHaze;

void main() {
  vec2 at = aSpot.xy;
  float still = stillAt(at);
  vec3 s = swell(at, uTime) * still;
  float yaw = aLook.x;
  float phase = aLook.y;
  float scale = aLook.z;
  float cell = aLook.w;

  // Out at sea a slip stands up to show its face; over the desk it lies flat.
  float rock = sin(uTime * 0.8 + phase) * 0.07 * still;
  float pitch = uStand * 1.2 + rock;
  float x = position.x * uSize.x * scale;
  float v = (position.y + 0.5) * uSize.y * scale;
  vec3 local = vec3(x, v * sin(pitch), -v * cos(pitch));
  vec3 face = vec3(0.0, cos(pitch), sin(pitch));
  float c = cos(yaw);
  float n = sin(yaw);
  local = vec3(local.x * c + local.z * n, local.y, -local.x * n + local.z * c);
  face = vec3(face.x * c + face.z * n, face.y, -face.x * n + face.z * c);

  // Tilted by the water under it, and riding low in it.
  vec3 up = normalize(vec3(-s.y, 1.0, -s.z));
  vec3 tx = vec3(1.0, s.y, 0.0);
  vec3 right = normalize(tx - up * dot(tx, up));
  vec3 forward = cross(right, up);
  float sunk = (1.0 - aSpot.z) * (uSize.y * scale + 0.3);
  float ride = mix(0.07, -0.035, uStand);
  vec3 world = vec3(at.x, uLevel + s.x + ride - sunk, at.y) + right * local.x + up * local.y + forward * local.z;
  vec3 facing = right * face.x + up * face.y + forward * face.z;
  vLight = 0.9 + 0.12 * dot(facing, uLight);

  float column = mod(cell, uColumns);
  float row = floor(cell / uColumns);
  vUv = vec2((column + position.x + 0.5) * uCells.x, 1.0 - (row + 0.5 - position.y) * uCells.y);
  vec4 view = viewMatrix * vec4(world, 1.0);
  vHaze = hazeAt(-view.z);
  gl_Position = projectionMatrix * view;
}
`;

const SLIP_FRAGMENT = /* glsl */ `
uniform sampler2D uAtlas;
uniform vec3 uPaper;
varying vec2 vUv;
varying float vLight;
varying float vHaze;

void main() {
  vec4 face = texture2D(uAtlas, vUv);
  if (face.a < 0.02) discard;
  vec3 color = gl_FrontFacing ? face.rgb * vLight : uPaper * 0.94;
  gl_FragColor = vec4(mix(uPaper, color, vHaze), face.a);
  #include <colorspace_fragment>
}
`;

const PAPER_VERTEX = /* glsl */ `
uniform float uBend;
uniform float uHalfW;
varying vec2 vUv;
varying vec3 vNormalW;

void main() {
  vec3 p = position;
  float nx = p.x / uHalfW;
  // A sheet flexes along its length; its normal follows the curve.
  p.z += uBend * (nx * nx - 0.33) * uHalfW * 0.6;
  float slope = uBend * 1.2 * nx;
  vNormalW = normalize(mat3(modelMatrix) * normalize(vec3(-slope, 0.0, 1.0)));
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

const PAPER_FRAGMENT = /* glsl */ `
uniform sampler2D uFace;
uniform vec3 uBack;
uniform vec3 uLight;
uniform float uOpacity;
varying vec2 vUv;
varying vec3 vNormalW;

void main() {
  vec3 n = normalize(vNormalW) * (gl_FrontFacing ? 1.0 : -1.0);
  float light = max(dot(n, uLight), 0.0);
  vec3 base = gl_FrontFacing ? texture2D(uFace, vUv).rgb : uBack;
  gl_FragColor = vec4(base * (0.8 + 0.26 * light), uOpacity);
  #include <colorspace_fragment>
}
`;

const SHEET_PAPER = "#f8f4ea";
/** Shadows lie on the piece, and under every page. */
const SHADOW_HEIGHT = 0.009;

const PRINT_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/**
 * The piece, blank but for its frame until each section's page is pressed
 * in; then that section inks in, spreading from where the page went down,
 * ragged at its edge like ink taking to paper.
 */
const PRINT_FRAGMENT = /* glsl */ `
uniform sampler2D uPrint;
uniform vec3 uPaper;
uniform float uOpacity;
uniform float uAspect;
uniform vec4 uSections[${READING_ORDER.length}];
uniform vec2 uPress[${READING_ORDER.length}];
uniform float uInk[${READING_ORDER.length}];
varying vec2 vUv;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

void main() {
  // Fractions of the sheet, from its top left.
  vec2 at = vec2(vUv.x, 1.0 - vUv.y);
  vec2 scale = vec2(uAspect, 1.0);
  float shown = 1.0;
  for (int i = 0; i < ${READING_ORDER.length}; i++) {
    vec4 band = uSections[i];
    float inside = step(band.x, at.x) * step(at.x, band.z) * step(band.y, at.y) * step(at.y, band.w);
    vec2 far = max(abs(band.xy - uPress[i]), abs(band.zw - uPress[i]));
    float reach = length(far * scale) * 1.1;
    float d = length((at - uPress[i]) * scale) + (noise(at * 70.0) - 0.5) * 0.035;
    shown = mix(shown, smoothstep(0.0, 0.02, uInk[i] * reach - d), inside);
  }
  gl_FragColor = vec4(mix(uPaper, texture2D(uPrint, vUv).rgb, shown), uOpacity);
  #include <colorspace_fragment>
}
`;

/**
 * Splat the strokes at each slip's foot into the marks map. Like a reflection,
 * they run from the slip toward the eye, so on screen they fall straight
 * below it, and they reach the same few of the water's lines however far off
 * the slip floats.
 */
function splatMarks(marks: Uint8Array, flotilla: Slip[], spots: Float32Array, eye: Vector3, pixelsPerRadian: number) {
  marks.fill(0);
  const x0 = MARKS_AREA.x;
  const z0 = MARKS_AREA.z;
  const cellX = MARKS_AREA.width / MARKS_W;
  const cellZ = MARKS_AREA.depth / MARKS_H;
  for (let i = 0; i < flotilla.length; i += 1) {
    const sx = spots[i * 3];
    const sz = spots[i * 3 + 1];
    const d = Math.hypot(sx - eye.x, sz - eye.z);
    // Far out the marks would only smudge; they fade before they do.
    const up = spots[i * 3 + 2] * (1 - Math.min(1, Math.max(0, (d - 18) / 16)));
    if (up < 0.05 || d < 0.5) continue;
    // The water's lines are at least nine pixels apart on screen.
    const spacing = Math.max(LINE_PITCH, (9 * d * d) / (Math.max(eye.y, 0.5) * pixelsPerRadian));
    const reach = Math.min(4, spacing * MARK_LINES);
    const half = (SLIP_W * flotilla[i].scale * Math.abs(Math.cos(flotilla[i].yaw))) / 2;
    const ax = (eye.x - sx) / d;
    const az = (eye.z - sz) / d;
    const xs = [sx - half * az - 0.05 * ax, sx + half * az - 0.05 * ax, sx - half * az + reach * ax, sx + half * az + reach * ax];
    const zs = [sz + half * ax - 0.05 * az, sz - half * ax - 0.05 * az, sz + half * ax + reach * az, sz - half * ax + reach * az];
    const c0 = Math.max(0, Math.floor((Math.min(...xs) - x0) / cellX));
    const c1 = Math.min(MARKS_W - 1, Math.ceil((Math.max(...xs) - x0) / cellX));
    const r0 = Math.max(0, Math.floor((Math.min(...zs) - z0) / cellZ));
    const r1 = Math.min(MARKS_H - 1, Math.ceil((Math.max(...zs) - z0) / cellZ));
    for (let r = r0; r <= r1; r += 1) {
      const dz = z0 + (r + 0.5) * cellZ - sz;
      for (let c = c0; c <= c1; c += 1) {
        const dx = x0 + (c + 0.5) * cellX - sx;
        const ahead = dx * ax + dz * az;
        const across = Math.abs(dx * az - dz * ax);
        if (ahead < -0.05 || ahead > reach || across > half) continue;
        const near = Math.round(255 * up * Math.min(1, 1 - ahead / reach));
        const middle = Math.round(255 * (1 - across / half));
        const at = (r * MARKS_W + c) * 2;
        if (near > marks[at]) marks[at] = near;
        if (middle > marks[at + 1]) marks[at + 1] = middle;
      }
    }
  }
}

/** The water's grid: rows close together near the visitor, wider toward the horizon. */
function waterGrid(): BufferGeometry {
  const xs: number[] = [];
  for (let x = -WATER_X; x <= WATER_X + 1e-6; x += 0.3) xs.push(x);
  const zs: number[] = [];
  for (let z = WATER_NEAR; z > WATER_FAR; z -= 0.16 + 0.016 * (WATER_NEAR - z)) zs.push(z);
  zs.push(WATER_FAR);
  const positions = new Float32Array(xs.length * zs.length * 3);
  zs.forEach((z, r) => xs.forEach((x, c) => positions.set([x, 0, z], (r * xs.length + c) * 3)));
  const indices: number[] = [];
  for (let r = 0; r < zs.length - 1; r += 1) {
    for (let c = 0; c < xs.length - 1; c += 1) {
      const a = r * xs.length + c;
      const b = a + xs.length;
      // Counter-clockwise seen from above, so the water faces the sky.
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  return geometry;
}

type Sheet = {
  name: LoosePage;
  group: Group;
  paper: Mesh<PlaneGeometry, ShaderMaterial>;
  shadow: Mesh<PlaneGeometry, MeshBasicMaterial>;
  clock: number;
  seed: number;
};

export async function createHero3D(canvas: HTMLCanvasElement): Promise<Hero3D | null> {
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
  } catch {
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(new Color(PAPER), 1);
  renderer.outputColorSpace = SRGBColorSpace;
  const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const fonts = readFonts();
  const [, figure] = await Promise.all([loadFonts(fonts), loadImage("/illustrations/specimen-figure.svg")]);

  const scene = new Scene();
  const camera = new PerspectiveCamera(35, 1, 0.1, 220);
  const disposables: { dispose(): void }[] = [];
  const texture = (source: HTMLCanvasElement, srgb: boolean): Texture => {
    const t = new CanvasTexture(source);
    if (srgb) t.colorSpace = SRGBColorSpace;
    t.anisotropy = anisotropy;
    t.minFilter = LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    disposables.push(t);
    return t;
  };

  // ---------- The water ----------

  const light = new Vector3(-0.3, 0.55, 0.78).normalize();
  // Uniforms the water and the flotilla share, so both ride the same swell.
  const common = {
    uTime: { value: 0 },
    uPointer: { value: new Vector2(999, 999) },
    uWake: { value: 0 },
    uSpread: { value: 0 },
    uChannel: { value: 6.8 },
    uHazeNear: { value: 22 },
    uHazeFar: { value: 88 },
    uLevel: { value: WATER_LEVEL },
    uStand: { value: 1 },
    uPaper: { value: new Color(PAPER) },
    uLight: { value: light },
  };

  // The strokes each slip leaves at its foot, splatted each frame into a map
  // of the water the shader reads.
  const marks = new Uint8Array(MARKS_W * MARKS_H * 2);
  const marksTexture = new DataTexture(marks, MARKS_W, MARKS_H, RGFormat, UnsignedByteType);
  marksTexture.magFilter = LinearFilter;
  marksTexture.minFilter = LinearFilter;
  marksTexture.needsUpdate = true;
  disposables.push(marksTexture);

  const water = new Mesh(waterGrid(), new ShaderMaterial({
    vertexShader: WATER_VERTEX,
    fragmentShader: WATER_FRAGMENT,
    uniforms: {
      ...common,
      uInk: { value: new Color(WATER_INK) },
      uPitch: { value: LINE_PITCH },
      uPixelRatio: { value: renderer.getPixelRatio() },
      uMarks: { value: marksTexture },
      uMarksArea: { value: new Vector4(MARKS_AREA.x, MARKS_AREA.z, 1 / MARKS_AREA.width, 1 / MARKS_AREA.depth) },
    },
  }));
  water.frustumCulled = false;
  scene.add(water);
  disposables.push(water.geometry, water.material);

  // ---------- The flotilla ----------

  const atlas = drawSlipAtlas(fonts);
  const flotilla = scatterSlips({ count: SLIP_COUNT, seed: 11, xExtent: SLIP_X, zNear: SLIP_NEAR, zFar: SLIP_FAR });
  const spots = new Float32Array(SLIP_COUNT * 3);
  const looks = new Float32Array(SLIP_COUNT * 4);
  const drift = flotilla.map(() => ({ x: { value: 0, velocity: 0 } as Spring, z: { value: 0, velocity: 0 } as Spring }));
  flotilla.forEach((slip, i) => {
    looks.set([slip.yaw, slip.phase, slip.scale, slip.cell], i * 4);
    spots.set([slip.x, slip.z, afloat(slip.z, slip.sink)], i * 3);
  });
  const card = new PlaneGeometry(1, 1, 1, 1);
  const slipGeometry = new InstancedBufferGeometry();
  slipGeometry.index = card.index;
  slipGeometry.setAttribute("position", card.getAttribute("position"));
  const spotAttribute = new InstancedBufferAttribute(spots, 3);
  spotAttribute.setUsage(DynamicDrawUsage); // The current moves them every frame.
  slipGeometry.setAttribute("aSpot", spotAttribute);
  slipGeometry.setAttribute("aLook", new InstancedBufferAttribute(looks, 4));
  slipGeometry.instanceCount = SLIP_COUNT;
  const slipMaterial = new ShaderMaterial({
    vertexShader: SLIP_VERTEX,
    fragmentShader: SLIP_FRAGMENT,
    side: DoubleSide,
    alphaToCoverage: true,
    uniforms: {
      ...common,
      uAtlas: { value: texture(atlas.canvas, true) },
      uSize: { value: new Vector2(SLIP_W, SLIP_H) },
      uCells: { value: new Vector2(SLIP_CELL.w / atlas.canvas.width, SLIP_CELL.h / atlas.canvas.height) },
      uColumns: { value: atlas.columns },
    },
  });
  const slips = new Mesh(slipGeometry, slipMaterial);
  slips.frustumCulled = false;
  slips.renderOrder = 1;
  scene.add(slips);
  disposables.push(card, slipGeometry, slipMaterial);

  // Where the sea meets the sky, a single hairline.
  const horizon = new Mesh(
    new PlaneGeometry(420, 0.09),
    new MeshBasicMaterial({ color: new Color(PAPER).lerp(new Color(WATER_INK), 0.5), depthWrite: false }),
  );
  horizon.position.set(0, WATER_LEVEL + 0.02, WATER_FAR);
  scene.add(horizon);
  disposables.push(horizon.geometry, horizon.material);

  // ---------- The loose pages ----------

  const pageLight = new Vector3(-0.45, 1, 0.4).normalize();
  const shadowTexture = texture(drawShadow(), false);
  const sheets: Sheet[] = LOOSE_PAGES.map((name, i) => {
    const face = texture(drawPage(name, fonts), true);
    // Built at its real size, so the flex and its light are in true proportion.
    const size = PAGE_SIZES[name];
    const geometry = new PlaneGeometry(size.w * PX, size.h * PX, 28, 12);
    const material = new ShaderMaterial({
      vertexShader: PAPER_VERTEX,
      fragmentShader: PAPER_FRAGMENT,
      side: DoubleSide,
      transparent: true,
      uniforms: {
        uFace: { value: face },
        uBack: { value: new Color("#f3efe4") },
        uLight: { value: pageLight },
        uOpacity: { value: 0 },
        uBend: { value: 0 },
        uHalfW: { value: (size.w * PX) / 2 },
      },
    });
    const paper = new Mesh(geometry, material);
    paper.rotation.x = -Math.PI / 2;
    paper.renderOrder = 4 + i;
    const group = new Group();
    group.add(paper);
    const shadowMaterial = new MeshBasicMaterial({ map: shadowTexture, color: new Color("#1e2820"), transparent: true, opacity: 0, depthWrite: false });
    const shadow = new Mesh(new PlaneGeometry(1, 1), shadowMaterial);
    shadow.rotation.x = -Math.PI / 2;
    shadow.renderOrder = 2;
    scene.add(group, shadow);
    disposables.push(geometry, material, shadow.geometry, shadowMaterial);
    return { name, group, paper, shadow, clock: 0, seed: (i * 0.618 + 0.2) % 1 };
  });

  // ---------- The piece, and the crew that makes it ----------

  const printMaterial = new ShaderMaterial({
    vertexShader: PRINT_VERTEX,
    fragmentShader: PRINT_FRAGMENT,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uPrint: { value: texture(drawPrint(fonts, figure), true) },
      uPaper: { value: new Color(SHEET_PAPER) },
      uOpacity: { value: 0 },
      uAspect: { value: 1 },
      uSections: { value: READING_ORDER.map((page) => new Vector4(...SECTIONS[page])) },
      uPress: { value: READING_ORDER.map((page) => new Vector2((SECTIONS[page][0] + SECTIONS[page][2]) / 2, (SECTIONS[page][1] + SECTIONS[page][3]) / 2)) },
      uInk: { value: READING_ORDER.map(() => 0) },
    },
  });
  const print = new Mesh(new PlaneGeometry(1, 1), printMaterial);
  print.rotation.x = -Math.PI / 2;
  print.renderOrder = 1;
  print.visible = false;
  scene.add(print);
  disposables.push(print.geometry, printMaterial);

  const kit = robotKit(pageLight, texture(drawFaces(), true));
  disposables.push(kit);
  const robots: Robot[] = Array.from({ length: READING_ORDER.length }, (_, i) => {
    const shadow = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ map: shadowTexture, color: new Color("#1e2820"), transparent: true, opacity: 0, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.renderOrder = 2;
    disposables.push(shadow.geometry, shadow.material);
    const robot = buildRobot(kit, shadow, i * 0.37 + 0.11);
    robot.root.visible = false;
    shadow.visible = false;
    scene.add(robot.root, shadow);
    return robot;
  });
  let crew: Crew = planCrew("wide");
  let crewClock = 0;

  // ---------- Layout, camera, pointer ----------

  let width = 1;
  let height = 1;
  let kind: BoardKind = "wide";
  let places: Record<LoosePage, DeskPlace> = deskPlacements(kind);

  const layout = () => {
    width = window.innerWidth;
    height = window.innerHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    kind = boardKindFor(width, height);
    places = deskPlacements(kind);
    const board = BOARDS[kind];
    common.uChannel.value = (board.width * PX) / 2 + 0.8;
    // The piece sits where the flat desk sets it; the crew comes from just beyond what the camera sees.
    const sheet = printPlacement(kind);
    print.position.set(sheet.x, PRINT_HEIGHT, sheet.z);
    print.scale.set(sheet.w, sheet.h, 1);
    printMaterial.uniforms.uAspect.value = sheet.w / sheet.h;
    const straight = shotAt(0.35, camera.aspect, kind);
    crew = planCrew(kind, straight.position[1] * Math.tan((straight.fov * Math.PI) / 360) * camera.aspect + 0.4);
  };
  layout();

  const raycaster = new Raycaster();
  const waterPlane = new Plane(new Vector3(0, 1, 0), 0);
  const hit = new Vector3();
  const ndc = new Vector2();
  let pointer: { x: number; y: number } | null = null;
  let seaPointer: { x: number; z: number } | null = null;
  let smooth: Spring = { value: 0, velocity: 0 };
  let wake: Spring = { value: 0, velocity: 0 };
  let pool = { x: { value: 0, velocity: 0 } as Spring, z: { value: 0, velocity: 0 } as Spring };
  const started = performance.now();
  let last = started;
  let marksDirty = true;

  const frame = (now: number, progress: number) => {
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    smooth = stepSpring(smooth, progress, dt, 0.16);
    const p = smooth.value;

    const shot = shotAt(p, camera.aspect, kind);
    const view = viewOf(shot);
    camera.position.set(...view.position);
    camera.up.set(...view.up);
    camera.lookAt(shot.look[0], shot.look[1], shot.look[2]);

    // Where the pointer meets the water, if it does. The pool of still water glides after it.
    seaPointer = null;
    if (pointer) {
      ndc.set((pointer.x / width) * 2 - 1, -(pointer.y / height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      if (raycaster.ray.intersectPlane(waterPlane, hit) && hit.distanceTo(camera.position) < 60) seaPointer = { x: hit.x, z: hit.z };
    }
    if (seaPointer) {
      if (wake.value < 0.01) pool = { x: { value: seaPointer.x, velocity: 0 }, z: { value: seaPointer.z, velocity: 0 } };
      pool = { x: stepSpring(pool.x, seaPointer.x, dt, 0.12), z: stepSpring(pool.z, seaPointer.z, dt, 0.12) };
    }
    wake = stepSpring(wake, seaPointer ? 1 : 0, dt, 0.22);

    const { spread, rate } = seaAt(p);
    common.uTime.value = (now - started) / 1000;
    common.uPointer.value.set(pool.x.value, pool.z.value);
    common.uWake.value = wake.value;
    common.uSpread.value = spread;
    common.uStand.value = standAt(p);

    // The current carries every slip in; the parting moves each aside in its own time.
    const part: Parting = { pointer: { x: pool.x.value, z: pool.z.value }, wake: wake.value, spread, channel: common.uChannel.value };
    const span = SLIP_NEAR - SLIP_FAR;
    flotilla.forEach((slip, i) => {
      let z = slip.z + dt * FLOW * rate;
      if (z > SLIP_NEAR) z -= span;
      slip.z = z;
      const to = partSlip(slip.x, z, part);
      const moved = drift[i];
      moved.x = stepSpring(moved.x, to.x - slip.x, dt, 0.3);
      moved.z = stepSpring(moved.z, to.z - z, dt, 0.3);
      spots[i * 3] = slip.x + moved.x.value;
      spots[i * 3 + 1] = z + moved.z.value;
      spots[i * 3 + 2] = afloat(z, slip.sink);
    });
    spotAttribute.needsUpdate = true;
    if (common.uStand.value > 0.01 || marksDirty) {
      splatMarks(marks, flotilla, spots, camera.position, height / ((shot.fov * Math.PI) / 180));
      marksTexture.needsUpdate = true;
      marksDirty = common.uStand.value > 0.01;
    }

    // The crew works in real time once its moment comes, never behind the scroll.
    crewClock = advanceTask(crewClock, dt, p, ASSEMBLY, crew.duration);
    const time = (now - started) / 1000;
    const work = crewAt(crew, crewClock, time);
    print.visible = work.print > 0.001;
    print.position.y = PRINT_HEIGHT - 0.03 * (1 - work.print);
    printMaterial.uniforms.uOpacity.value = work.print;
    READING_ORDER.forEach((page, i) => (printMaterial.uniforms.uInk.value[i] = work.sections[page]));
    robots.forEach((robot, i) => robot.pose(work.bots[i], time));

    // Pages fall in their own time once their moment arrives; then they are the crew's.
    const drops = droppedAt(p);
    const fallFrom = view.position[1] * 0.46;
    sheets.forEach((sheet, i) => {
      sheet.clock = advanceClock(sheet.clock, drops[i], dt);
      const place = places[sheet.name];
      const held = work.pages[sheet.name];
      const pose = held
        ? { ...held, x: held.x - place.x, z: held.z - place.z, yaw: held.yaw - place.yaw, shadow: Math.max(0.25, 1 - held.y * 0.5) }
        : { ...fallPose(sheet.clock, sheet.seed, fallFrom), scale: 1 };
      const y = held ? held.y : pose.y + restHeight(sheet.name);
      sheet.group.position.set(place.x + pose.x, y, place.z + pose.z);
      sheet.group.rotation.set(pose.pitch, place.yaw + pose.yaw, pose.roll, "YXZ");
      sheet.group.scale.setScalar(pose.scale);
      sheet.group.visible = pose.opacity > 0.001;
      const uniforms = sheet.paper.material.uniforms;
      uniforms.uOpacity.value = pose.opacity;
      uniforms.uBend.value = pose.bend;
      // The shadow grows and softens with height, and slides away from the light.
      const lift = (1 + y * 0.1) * pose.scale;
      sheet.shadow.scale.set((place.w / 0.55) * lift, (place.h / 0.55) * lift, 1);
      sheet.shadow.position.set(place.x + pose.x + y * 0.2, SHADOW_HEIGHT, place.z + pose.z + y * 0.16);
      sheet.shadow.rotation.set(-Math.PI / 2, 0, place.yaw + pose.yaw);
      sheet.shadow.material.opacity = 0.24 * pose.shadow * pose.opacity;
      sheet.shadow.visible = sheet.group.visible;
    });

    renderer.render(scene, camera);
  };

  // Draw once at rest so the first visible frame is already composed.
  frame(performance.now(), 0);

  return {
    frame,
    pointer(clientX, clientY) {
      pointer = clientX === null || clientY === null ? null : { x: clientX, y: clientY };
    },
    resize: layout,
    dispose() {
      for (const item of disposables) item.dispose();
      for (const robot of robots) robot.dispose();
      renderer.dispose();
    },
  };
}

/**
 * One scene per canvas. A canvas has a single WebGL context, and two renderers
 * on it corrupt each other's state, so every user shares one scene; it is
 * disposed a tick after its last user leaves, which lets a quick remount (as
 * React does in development) keep it.
 */
type Lease = { hero: Promise<Hero3D | null>; release(): void };
const shared = new WeakMap<HTMLCanvasElement, { hero: Promise<Hero3D | null>; users: number; closing?: ReturnType<typeof setTimeout> }>();

export function acquireHero3D(canvas: HTMLCanvasElement): Lease {
  let entry = shared.get(canvas);
  if (!entry) {
    entry = { hero: createHero3D(canvas).catch(() => null), users: 0 };
    shared.set(canvas, entry);
  }
  if (entry.closing) {
    clearTimeout(entry.closing);
    entry.closing = undefined;
  }
  entry.users += 1;
  const held = entry;
  let released = false;
  return {
    hero: held.hero,
    release() {
      if (released) return;
      released = true;
      held.users -= 1;
      if (held.users > 0) return;
      held.closing = setTimeout(() => {
        shared.delete(canvas);
        void held.hero.then((hero) => hero?.dispose());
      }, 0);
    },
  };
}
