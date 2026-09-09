/** Original ink-current shader. No textures, dependencies, or external assets. */
const VERTEX = `
attribute vec2 a_position;
void main() { gl_Position = vec4(a_position, 0.0, 1.0); }
`;

const FRAGMENT = `
precision highp float;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_progress;

void main() {
  // Work in viewport-height units so the curves keep their shape on phones.
  vec2 p = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float aspect = u_resolution.x / u_resolution.y;
  float side = step(0.0, p.x);
  float t = u_time * 0.12;
  float y = p.y + side * 1.7;
  float opening = smoothstep(0.0, 0.85, u_progress);

  // An asymmetric, slowly evolving stream function; its isolines are ink.
  float bend = 0.10 * sin(y * 5.0 + t)
             + 0.055 * sin(y * 9.0 - t * 0.7)
             + 0.025 * sin(y * 15.0 + t * 0.4);
  float bank = abs(p.x) - aspect * (0.16 + opening * 0.28);
  float field = bank + bend * (1.0 - opening * 0.5);
  float spacing = 0.027;
  float distanceToLine = abs(fract(field / spacing + 0.5) - 0.5) * spacing;
  float pixel = 1.0 / u_resolution.y;
  float ink = 1.0 - smoothstep(pixel * 0.25, pixel * 1.35, distanceToLine);

  // Fade each bank toward the reading channel, and toward the outer edge.
  float ribbon = smoothstep(-0.035, 0.075, field)
               * (1.0 - smoothstep(0.30, 0.57, field));
  float edge = 1.0 - smoothstep(0.42, 0.56, abs(p.y));
  float hush = 1.0 - smoothstep(0.58, 1.0, u_progress);
  float alpha = ink * ribbon * edge * hush * 0.23;
  vec3 forest = vec3(0.059, 0.290, 0.220);
  vec3 olive = vec3(0.36, 0.38, 0.25);
  vec3 color = mix(forest, olive, 0.3 + 0.25 * sin(y * 3.0));
  gl_FragColor = vec4(color * alpha, alpha);
}
`;

export type ContourRenderer = {
  resize: (width: number, height: number) => void;
  draw: (time: number, progress: number) => void;
  dispose: () => void;
};

/** Returns null when GPU rendering is unavailable; the SVG stays visible. */
export function createContourRenderer(canvas: HTMLCanvasElement): ContourRenderer | null {
  let gl: WebGLRenderingContext | null;
  try {
    gl = canvas.getContext("webgl", {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: "low-power",
      preserveDrawingBuffer: false,
    });
  } catch {
    return null;
  }
  if (!gl) return null;
  const context = gl;
  const shaders: WebGLShader[] = [];
  const program = context.createProgram();
  const buffer = context.createBuffer();

  const release = () => {
    shaders.forEach((shader) => context.deleteShader(shader));
    context.deleteProgram(program);
    context.deleteBuffer(buffer);
    delete canvas.dataset.ready;
  };
  const compile = (type: number, source: string) => {
    const shader = context.createShader(type);
    if (!shader) return null;
    shaders.push(shader);
    context.shaderSource(shader, source);
    context.compileShader(shader);
    return context.getShaderParameter(shader, context.COMPILE_STATUS) ? shader : null;
  };
  const vertex = compile(context.VERTEX_SHADER, VERTEX);
  const fragment = compile(context.FRAGMENT_SHADER, FRAGMENT);
  if (!program || !buffer || !vertex || !fragment) {
    release();
    return null;
  }
  context.attachShader(program, vertex);
  context.attachShader(program, fragment);
  context.linkProgram(program);
  if (!context.getProgramParameter(program, context.LINK_STATUS)) {
    release();
    return null;
  }
  context.useProgram(program);
  context.bindBuffer(context.ARRAY_BUFFER, buffer);
  context.bufferData(context.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), context.STATIC_DRAW);
  const position = context.getAttribLocation(program, "a_position");
  context.enableVertexAttribArray(position);
  context.vertexAttribPointer(position, 2, context.FLOAT, false, 0, 0);
  const resolution = context.getUniformLocation(program, "u_resolution");
  const time = context.getUniformLocation(program, "u_time");
  const progress = context.getUniformLocation(program, "u_progress");

  // A lost context falls back to the static illustration for this mount.
  let lost = false;
  const onLost = () => {
    lost = true;
    delete canvas.dataset.ready;
  };
  canvas.addEventListener("webglcontextlost", onLost);

  return {
    resize(width, height) {
      // Bound fill rate, even on a Retina display; thin lines are soft by design.
      const scale = Math.min(window.devicePixelRatio || 1, 1.25, Math.sqrt(1_000_000 / Math.max(1, width * height)));
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      context.viewport(0, 0, canvas.width, canvas.height);
      context.uniform2f(resolution, canvas.width, canvas.height);
    },
    draw(seconds, amount) {
      if (lost || context.isContextLost()) return;
      context.uniform1f(time, seconds);
      context.uniform1f(progress, amount);
      context.drawArrays(context.TRIANGLES, 0, 3);
      canvas.dataset.ready = "true";
    },
    dispose() {
      canvas.removeEventListener("webglcontextlost", onLost);
      release();
    },
  };
}
