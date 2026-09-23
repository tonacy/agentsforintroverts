/**
 * One of the crew: a little flying desk robot. A paper-cream body inked
 * round its edge like everything else in the prints, tipped back like a
 * small monitor so its screen of a face looks up at the camera, a green
 * rotor, and two arms that reach down to hold a page from its middle.
 */

import {
  BackSide,
  BoxGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
  type Texture,
} from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

import type { BotPose } from "./crew";
import { FACE_MOODS } from "./textures";

const TOON_VERTEX = /* glsl */ `
varying vec3 vNormalW;
void main() {
  vNormalW = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/** Two tones and a soft step between them, like a print's flat colour. */
const TOON_FRAGMENT = /* glsl */ `
uniform vec3 uLit;
uniform vec3 uShade;
uniform vec3 uLight;
varying vec3 vNormalW;
void main() {
  float light = dot(normalize(vNormalW), uLight);
  gl_FragColor = vec4(mix(uShade, uLit, smoothstep(-0.05, 0.2, light)), 1.0);
  #include <colorspace_fragment>
}
`;

const FACE_VERTEX = /* glsl */ `
uniform float uCell;
uniform float uCells;
varying vec2 vUv;
void main() {
  vUv = vec2((uCell + uv.x) / uCells, uv.y);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FACE_FRAGMENT = /* glsl */ `
uniform sampler2D uFaces;
varying vec2 vUv;
void main() {
  gl_FragColor = vec4(texture2D(uFaces, vUv).rgb, 1.0);
  #include <colorspace_fragment>
}
`;

const INK = "#1b2a23";
const LEAF = "#0f4a38";

/** Geometry and materials the whole crew shares. */
export type RobotKit = {
  chassis: RoundedBoxGeometry;
  screen: PlaneGeometry;
  mast: CylinderGeometry;
  hub: SphereGeometry;
  blade: BoxGeometry;
  blur: CircleGeometry;
  arm: BoxGeometry;
  claw: BoxGeometry;
  cream: ShaderMaterial;
  leaf: ShaderMaterial;
  wash: MeshBasicMaterial;
  outline: MeshBasicMaterial;
  ink: MeshBasicMaterial;
  faces: Texture;
  dispose(): void;
};

export function robotKit(light: Vector3, faces: Texture): RobotKit {
  const toon = (lit: string, shade: string) =>
    new ShaderMaterial({
      vertexShader: TOON_VERTEX,
      fragmentShader: TOON_FRAGMENT,
      uniforms: { uLit: { value: new Color(lit) }, uShade: { value: new Color(shade) }, uLight: { value: light } },
    });
  const kit = {
    chassis: new RoundedBoxGeometry(0.6, 0.46, 0.4, 4, 0.12),
    screen: new PlaneGeometry(0.44, 0.3),
    mast: new CylinderGeometry(0.022, 0.022, 0.16, 8),
    hub: new SphereGeometry(0.045, 12, 8),
    blade: new BoxGeometry(0.5, 0.012, 0.042),
    blur: new CircleGeometry(0.33, 32),
    arm: new BoxGeometry(0.05, 0.22, 0.05),
    claw: new BoxGeometry(0.09, 0.035, 0.07),
    cream: toon("#f6f1e5", "#d8cfba"),
    leaf: toon("#1c6048", "#0c3a2c"),
    wash: new MeshBasicMaterial({ color: new Color(LEAF), transparent: true, opacity: 0.16, depthWrite: false, side: DoubleSide }),
    outline: new MeshBasicMaterial({ color: new Color(INK), side: BackSide }),
    ink: new MeshBasicMaterial({ color: new Color(INK) }),
    faces,
  };
  return {
    ...kit,
    dispose() {
      for (const item of [kit.chassis, kit.screen, kit.mast, kit.hub, kit.blade, kit.blur, kit.arm, kit.claw, kit.cream, kit.leaf, kit.wash, kit.outline, kit.ink]) item.dispose();
    },
  };
}

export type Robot = {
  root: Group;
  shadow: Mesh;
  pose(pose: BotPose, time: number): void;
  dispose(): void;
};

/** How far the body tips back, so its screen looks up at the camera above. */
const TIP = 0.6;

export function buildRobot(kit: RobotKit, shadow: Mesh, seed: number): Robot {
  const root = new Group();
  const body = new Group();
  root.add(body);

  // A little monitor, tipped back.
  const tipped = new Group();
  tipped.rotation.x = -TIP;
  body.add(tipped);
  tipped.add(new Mesh(kit.chassis, kit.cream));
  const outline = new Mesh(kit.chassis, kit.outline);
  outline.scale.set(1.07, 1.08, 1.1);
  tipped.add(outline);
  const face = new ShaderMaterial({
    vertexShader: FACE_VERTEX,
    fragmentShader: FACE_FRAGMENT,
    uniforms: { uFaces: { value: kit.faces }, uCell: { value: 0 }, uCells: { value: FACE_MOODS.length } },
  });
  const screen = new Mesh(kit.screen, face);
  screen.position.set(0, 0.01, 0.203);
  tipped.add(screen);

  // The rotor stands straight up from the top of the tipped body.
  const top = new Vector3(0, 0.23, 0).applyAxisAngle(new Vector3(1, 0, 0), -TIP);
  const mast = new Mesh(kit.mast, kit.ink);
  mast.position.set(0, top.y + 0.06, top.z);
  body.add(mast);
  const rotor = new Group();
  rotor.position.set(0, top.y + 0.14, top.z);
  const wash = new Mesh(kit.blur, kit.wash);
  wash.rotation.x = -Math.PI / 2;
  const crossed = new Mesh(kit.blade, kit.leaf);
  crossed.rotation.y = Math.PI / 2;
  rotor.add(new Mesh(kit.hub, kit.leaf), new Mesh(kit.blade, kit.leaf), crossed, wash);
  body.add(rotor);

  // Arms from under the body, reaching down to a page held from its middle.
  const bottom = new Vector3(0, -0.23, 0).applyAxisAngle(new Vector3(1, 0, 0), -TIP);
  const arms = [-1, 1].map((side) => {
    const shoulder = new Group();
    shoulder.position.set(side * 0.24, bottom.y + 0.04, bottom.z);
    const arm = new Mesh(kit.arm, kit.ink);
    arm.position.y = -0.11;
    const claw = new Mesh(kit.claw, kit.ink);
    claw.position.y = -0.225;
    shoulder.add(arm, claw);
    body.add(shoulder);
    return { shoulder, side };
  });

  return {
    root,
    shadow,
    pose(pose, time) {
      root.visible = pose.visible;
      shadow.visible = pose.visible;
      if (!pose.visible) return;
      root.position.set(pose.x, pose.y, pose.z);
      root.rotation.set(0, pose.yaw, 0);
      body.rotation.set(pose.pitch, 0, pose.roll);
      rotor.rotation.y = time * 19 + seed * 3;
      // Arms swing out at ease, and come straight down and in to hold a page.
      const sway = 0.08 * Math.sin(time * 3.1 + seed * 5) * (1 - pose.grip);
      for (const { shoulder, side } of arms) shoulder.rotation.z = side * (0.8 * (1 - pose.grip) - 0.1 * pose.grip + sway);
      face.uniforms.uCell.value = FACE_MOODS.indexOf(pose.mood);
      // A soft shadow on the desk below, slid away from the light and fading with height.
      shadow.position.set(pose.x + pose.y * 0.2, 0.009, pose.z + pose.y * 0.16);
      shadow.scale.setScalar(0.95 * (1 + pose.y * 0.12));
      (shadow.material as MeshBasicMaterial).opacity = 0.22 * Math.max(0.35, 1 - pose.y * 0.3);
    },
    dispose() {
      face.dispose();
    },
  };
}
