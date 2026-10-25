import * as THREE from 'three';
import type { FieldLayout, MatchSetup, MatchSnapshot, RobotSnapshot } from '@rebuilt/shared';
import { createRobotModel, type RobotVisual } from './robotModel';
import { makeCarpetTexture, makeTextTexture } from './textures';

export type CameraMode = 'driver' | 'broadcast' | 'field' | 'orbit';

export interface FieldSceneOptions {
  field: FieldLayout;
  setup: MatchSetup;
  focusRobotId?: string;
  playerRobotId?: string;
  cameraMode?: CameraMode;
  quality?: 'high' | 'balanced';
}

const RED = new THREE.Color('#c8102e');
const BLUE = new THREE.Color('#0057b8');
const YELLOW = new THREE.Color('#ffd23f');
const ALUMINIUM = new THREE.Color('#c2cad4');

const UP = new THREE.Vector3(0, 1, 0);

function material(
  color: THREE.ColorRepresentation,
  opts: Partial<THREE.MeshStandardMaterialParameters> = {},
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.2, ...opts });
}

function box(
  parent: THREE.Object3D,
  mat: THREE.Material,
  sx: number,
  sy: number,
  sz: number,
  x: number,
  y: number,
  z: number,
  shadows = true,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = shadows;
  mesh.receiveShadow = shadows;
  parent.add(mesh);
  return mesh;
}

function beamBetween(
  parent: THREE.Object3D,
  mat: THREE.Material,
  a: THREE.Vector3,
  b: THREE.Vector3,
  thickness = 0.06,
): THREE.Mesh {
  const direction = new THREE.Vector3().subVectors(b, a);
  const length = direction.length();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(thickness, length, thickness), mat);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(UP, direction.normalize());
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

/**
 * Imperative Three.js arena renderer. React only creates it and hands it
 * snapshots, keeping the simulation completely separate from rendering.
 */
export class FieldScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  private readonly field: FieldLayout;
  private readonly setup: MatchSetup;
  private readonly container: HTMLElement;
  private readonly robots = new Map<string, { visual: RobotVisual; target: RobotSnapshot; label: THREE.Sprite }>();
  private readonly fuelMesh: THREE.InstancedMesh;
  private readonly fuelDummy = new THREE.Object3D();
  private readonly fuelDisplay = new Map<number, { x: number; y: number; z: number }>();
  private fuelTargets: Array<{ id: number; x: number; y: number; z: number }> = [];
  private readonly hubGlow: Record<'red' | 'blue', THREE.MeshStandardMaterial[]> = { red: [], blue: [] };
  private cameraMode: CameraMode;
  private focusRobotId?: string;
  private readonly playerRobotId?: string;
  private snapshot: MatchSnapshot | null = null;
  private lastFrame = performance.now();
  private elapsed = 0;
  private readonly cameraLook = new THREE.Vector3();
  private readonly resizeObserver: ResizeObserver;
  private readonly quality: 'high' | 'balanced';

  constructor(container: HTMLElement, options: FieldSceneOptions) {
    this.container = container;
    this.field = options.field;
    this.setup = options.setup;
    this.focusRobotId = options.focusRobotId;
    this.playerRobotId = options.playerRobotId;
    this.cameraMode = options.cameraMode ?? 'broadcast';
    this.quality = options.quality ?? 'high';

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.quality === 'high' ? 2 : 1.25));
    this.renderer.setSize(container.clientWidth || 1, container.clientHeight || 1);
    this.renderer.shadowMap.enabled = this.quality === 'high';
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.98;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.className = 'field-canvas';
    this.renderer.domElement.setAttribute('aria-label', 'REBUILT field simulation');
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0xe6eef7, 42, 96);
    this.camera = new THREE.PerspectiveCamera(45, (container.clientWidth || 1) / (container.clientHeight || 1), 0.08, 160);
    this.camera.position.set(this.field.size.length * 0.82, 8.2, this.field.size.width * 2.35);
    this.cameraLook.set(this.field.size.length * 0.5, 0.6, this.field.size.width * 0.5);

    this.addSky();
    this.addLights();
    this.addArena();
    this.addField();
    this.addHubs();
    this.addTowers();
    this.addOutposts();
    this.addBarriers();
    this.addSetDressing();
    this.addRobots();

    const maxFuel = Math.max(48, this.field.fuelSpawns.reduce((n, s) => n + s.count, 0) + 32);
    this.fuelMesh = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.083, 10, 8),
      material(YELLOW, { roughness: 0.66, metalness: 0.05, emissive: '#4a3500', emissiveIntensity: 0.28 }),
      Math.min(190, maxFuel),
    );
    this.fuelMesh.castShadow = false;
    this.fuelMesh.receiveShadow = false;
    this.scene.add(this.fuelMesh);
    this.fuelMesh.count = 0;

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.updateCamera(0, true);
    this.renderer.setAnimationLoop(this.animate);
  }

  private addSky(): void {
    const geo = new THREE.SphereGeometry(90, 24, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        top: { value: new THREE.Color('#bcd6f0') },
        bottom: { value: new THREE.Color('#f7fafd') },
        glow: { value: new THREE.Color('#ffffff') },
      },
      vertexShader: `varying vec3 vWorld; void main(){ vWorld = (modelMatrix * vec4(position,1.0)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `varying vec3 vWorld; uniform vec3 top; uniform vec3 bottom; uniform vec3 glow; void main(){ float h = clamp(normalize(vWorld).y * 0.5 + 0.5, 0.0, 1.0); vec3 col = mix(bottom, top, smoothstep(0.02, 0.9, h)); col += glow * 0.06 * smoothstep(0.55, 0.95, h); gl_FragColor = vec4(col, 1.0); }`,
    });
    this.scene.add(new THREE.Mesh(geo, mat));
  }

  private addLights(): void {
    this.scene.add(new THREE.HemisphereLight(0xe9f1fb, 0x9aa2ab, 1.35));
    const key = new THREE.DirectionalLight(0xfffaf1, 2.1);
    key.position.set(7, 16, 7);
    key.castShadow = this.quality === 'high';
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -15;
    key.shadow.camera.right = 15;
    key.shadow.camera.top = 15;
    key.shadow.camera.bottom = -15;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 40;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.03;
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xdce8f7, 0.55);
    fill.position.set(-8, 8, -7);
    this.scene.add(fill);
  }

  private addArena(): void {
    const { length: L, width: W } = this.field.size;
    const apron = new THREE.Mesh(
      new THREE.PlaneGeometry(46, 30),
      new THREE.MeshStandardMaterial({ color: '#b9bec5', roughness: 0.94, metalness: 0.03 }),
    );
    apron.rotation.x = -Math.PI / 2;
    apron.position.set(L / 2, -0.05, W / 2);
    apron.receiveShadow = true;
    this.scene.add(apron);

    // Fence line: white safety railing around the field, like the real venue.
    const postMat = material('#eef2f6', { metalness: 0.12, roughness: 0.62 });
    const railMat = material('#f6f8fa', { metalness: 0.14, roughness: 0.55 });
    const fenceOffset = 2.0;
    for (const z of [-fenceOffset, W + fenceOffset]) {
      box(this.scene, railMat, L + 6.6, 0.05, 0.05, L / 2, 1.03, z, false);
      box(this.scene, railMat, L + 6.6, 0.04, 0.04, L / 2, 0.56, z, false);
      for (let x = -3.1; x <= L + 3.2; x += 2.05) {
        box(this.scene, postMat, 0.075, 1.08, 0.075, x, 0.54, z);
      }
    }
    for (const x of [-4.1, L + 4.1]) {
      box(this.scene, railMat, 0.05, 0.05, W + 4.6, x, 1.03, W / 2, false);
      box(this.scene, railMat, 0.04, 0.04, W + 4.6, x, 0.56, W / 2, false);
      for (let z = -2.2; z <= W + 2.3; z += 2.05) {
        box(this.scene, postMat, 0.075, 1.08, 0.075, x, 0.54, z);
      }
    }
  }

  private addField(): void {
    const { length: L, width: W, wallHeight } = this.field.size;
    const cx = L / 2;
    const cz = W / 2;

    const carpetTex = makeCarpetTexture('light');
    const carpet = new THREE.Mesh(
      new THREE.PlaneGeometry(L, W),
      new THREE.MeshStandardMaterial({ map: carpetTex, roughness: 0.97, metalness: 0.02 }),
    );
    carpet.rotation.x = -Math.PI / 2;
    carpet.position.set(cx, 0, cz);
    carpet.receiveShadow = true;
    this.scene.add(carpet);

    // Alliance floor paint on each end.
    const zoneRed = new THREE.MeshBasicMaterial({ color: RED, transparent: true, opacity: 0.16, depthWrite: false });
    const zoneBlue = new THREE.MeshBasicMaterial({ color: BLUE, transparent: true, opacity: 0.16, depthWrite: false });
    for (const [alliance, mat] of [['red', zoneRed], ['blue', zoneBlue]] as const) {
      const zone = new THREE.Mesh(new THREE.PlaneGeometry(4.4, W - 0.24), mat);
      zone.rotation.x = -Math.PI / 2;
      zone.position.set(alliance === 'red' ? 2.2 : L - 2.2, 0.008, cz);
      this.scene.add(zone);
    }

    const lineMat = new THREE.MeshBasicMaterial({ color: '#f7f9fb' });
    const redLine = new THREE.MeshBasicMaterial({ color: '#d92b41' });
    const blueLine = new THREE.MeshBasicMaterial({ color: '#2d79ff' });
    const yellowLine = new THREE.MeshBasicMaterial({ color: '#f5c33b' });
    const addStripe = (mat: THREE.Material, x: number, z: number, sx: number, sz: number, y = 0.014) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.006, sz), mat);
      mesh.position.set(x, y, z);
      this.scene.add(mesh);
    };
    // Boundary and zone lines.
    addStripe(lineMat, cx, 0.34, L - 0.68, 0.05);
    addStripe(lineMat, cx, W - 0.34, L - 0.68, 0.05);
    addStripe(lineMat, 0.34, cz, 0.05, W - 0.68);
    addStripe(lineMat, L - 0.34, cz, 0.05, W - 0.68);
    addStripe(redLine, 4.4, cz, 0.05, W - 0.5);
    addStripe(blueLine, L - 4.4, cz, 0.05, W - 0.5);
    addStripe(lineMat, cx, cz, 0.05, W - 0.5);
    // Neutral fuel area outline.
    addStripe(lineMat, cx, cz - 1.9, 4.6, 0.04);
    addStripe(lineMat, cx, cz + 1.9, 4.6, 0.04);
    addStripe(lineMat, cx - 2.3, cz, 0.04, 3.8);
    addStripe(lineMat, cx + 2.3, cz, 0.04, 3.8);
    // Starting squares.
    for (const alliance of ['red', 'blue'] as const) {
      const mat = alliance === 'red' ? redLine : blueLine;
      for (const spot of this.field.startingPositions[alliance]) {
        addStripe(mat, spot.x, spot.y - 0.44, 0.9, 0.04);
        addStripe(mat, spot.x, spot.y + 0.44, 0.9, 0.04);
        addStripe(mat, spot.x - 0.44, spot.y, 0.04, 0.9);
        addStripe(mat, spot.x + 0.44, spot.y, 0.04, 0.9);
      }
    }
    // Center FUEL marking.
    addStripe(yellowLine, cx, cz, 1.0, 0.035, 0.016);

    // Low field walls: grey on the long sides, alliance coloured at the ends.
    const greyWall = material('#d6dbe1', { roughness: 0.62, metalness: 0.08 });
    const redWall = material('#b4162c', { roughness: 0.55, metalness: 0.12 });
    const blueWall = material('#0d4b9e', { roughness: 0.55, metalness: 0.12 });
    const capMat = material('#f0f3f6', { roughness: 0.4, metalness: 0.3 });
    const tapeMat = new THREE.MeshBasicMaterial({ color: '#f2c230' });
    const wallH = Math.min(0.62, wallHeight);
    const addWall = (x: number, z: number, sx: number, sz: number, baseMat: THREE.Material) => {
      box(this.scene, baseMat, sx, wallH - 0.08, sz, x, (wallH - 0.08) / 2, z);
      box(this.scene, capMat, sx + 0.05, 0.08, sz + 0.05, x, wallH - 0.04, z, false);
    };
    addWall(cx, -0.07, L, 0.14, greyWall);
    addWall(cx, W + 0.07, L, 0.14, greyWall);
    addWall(-0.07, cz, 0.14, W, redWall);
    addWall(L + 0.07, cz, 0.14, W, blueWall);

    // Yellow hazard tape along the inside of both sidelines.
    for (let x = 0.55; x < L - 0.4; x += 1.05) {
      box(this.scene, tapeMat, 0.52, 0.1, 0.012, x, 0.16, 0.012, false);
      box(this.scene, tapeMat, 0.52, 0.1, 0.012, x, 0.16, W - 0.012, false);
    }
    for (let z = 0.55; z < W - 0.4; z += 1.05) {
      box(this.scene, tapeMat, 0.012, 0.1, 0.52, 0.012, 0.16, z, false);
      box(this.scene, tapeMat, 0.012, 0.1, 0.52, L - 0.012, 0.16, z, false);
    }

    // Low guard rail just behind the walls on the long sides.
    const guardMat = material('#cfd6de', { metalness: 0.4, roughness: 0.45 });
    for (const z of [-0.55, W + 0.55]) {
      box(this.scene, guardMat, L + 0.6, 0.04, 0.04, cx, 0.72, z, false);
      for (let x = -0.2; x <= L + 0.3; x += 2.6) {
        box(this.scene, guardMat, 0.05, 0.72, 0.05, x, 0.36, z);
      }
    }

  }

  /**
   * The HUB: a raised platform, a wide funnel around the scoring opening,
   * a team-coloured backboard and the tall mast pair that carries the lights.
   */
  private addHubs(): void {
    for (const hub of this.field.hubs) {
      const group = new THREE.Group();
      group.position.set(hub.x, 0, hub.y);
      group.rotation.y = hub.rotation;
      this.scene.add(group);

      const allianceColor = hub.alliance === 'red' ? RED : BLUE;
      const allianceDark = hub.alliance === 'red' ? '#750a1c' : '#002a61';
      const steel = material(ALUMINIUM, { metalness: 0.75, roughness: 0.32 });
      const dark = material('#2c333c', { metalness: 0.55, roughness: 0.42 });
      const black = material('#14181e', { metalness: 0.4, roughness: 0.5 });
      const allyMat = material(allianceColor, { roughness: 0.44, metalness: 0.28 });
      const allyDark = material(allianceDark, { roughness: 0.52, metalness: 0.22 });
      const glowMat = material(allianceColor, {
        emissive: allianceColor,
        emissiveIntensity: 1.1,
        roughness: 0.3,
      });
      const polyMat = new THREE.MeshPhysicalMaterial({
        color: '#dce9f7',
        transparent: true,
        opacity: 0.22,
        roughness: 0.08,
        metalness: 0.05,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      this.hubGlow[hub.alliance].push(glowMat);

      // Platform and coloured trim.
      box(group, dark, 2.45, 0.1, 2.0, 0, 0.05, 0);
      box(group, allyMat, 2.5, 0.06, 0.09, 0, 0.11, 0.98);
      box(group, allyMat, 2.5, 0.06, 0.09, 0, 0.11, -0.98);
      box(group, allyMat, 0.09, 0.06, 2.0, 1.22, 0.11, 0);
      box(group, allyMat, 0.09, 0.06, 2.0, -1.22, 0.11, 0);
      // Feed ramp at the mouth.
      const ramp = box(group, allyDark, 1.15, 0.05, 1.5, 0.82, 0.38, 0);
      ramp.rotation.z = -0.3;
      for (const z of [-0.7, 0.7]) {
        box(group, steel, 0.06, 0.36, 0.06, 1.3, 0.2, z);
      }

      // Funnel body (four-sided truncated cone) with a bright rim.
      const funnel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.72, 1.14, 0.62, 4, 1, true),
        allyDark,
      );
      funnel.rotation.y = Math.PI / 4;
      funnel.position.set(0, 0.48, 0);
      funnel.castShadow = true;
      group.add(funnel);
      const funnelRim = new THREE.Mesh(new THREE.CylinderGeometry(0.74, 0.76, 0.06, 4), allyMat);
      funnelRim.rotation.y = Math.PI / 4;
      funnelRim.position.set(0, 0.8, 0);
      group.add(funnelRim);
      // Scoring tube and opening.
      const tube = new THREE.Mesh(
        new THREE.CylinderGeometry(0.62, 0.62, 0.58, 24, 1, true),
        new THREE.MeshStandardMaterial({ color: '#20262e', roughness: 0.7, metalness: 0.3, side: THREE.DoubleSide }),
      );
      tube.position.set(0, 1.08, 0);
      group.add(tube);
      const hole = new THREE.Mesh(
        new THREE.CircleGeometry(0.6, 24),
        new THREE.MeshBasicMaterial({ color: '#05070a' }),
      );
      hole.rotation.x = -Math.PI / 2;
      hole.position.set(0, 1.31, 0);
      group.add(hole);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.64, 0.04, 8, 32), glowMat);
      rim.rotation.x = Math.PI / 2;
      rim.position.set(0, 1.36, 0);
      group.add(rim);

      // Backboard with signage facing the field.
      const backboard = box(group, allyMat, 0.12, 1.85, 2.1, -1.16, 1.0, 0);
      backboard.rotation.z = 0.14;
      box(group, black, 0.16, 0.1, 2.2, -1.05, 1.94, 0, false);
      const signTex = makeTextTexture(hub.alliance === 'red' ? 'RED HUB' : 'BLUE HUB', {
        width: 512,
        height: 256,
        background: allianceDark,
        color: '#ffffff',
        accent: allianceColor.getStyle(),
        sub: 'FUEL SCORING',
        border: true,
      });
      const signMat = new THREE.MeshBasicMaterial({ map: signTex, toneMapped: false });
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.55, 0.78), signMat);
      sign.position.set(-1.04, 1.1, 0);
      sign.rotation.y = Math.PI / 2;
      group.add(sign);

      // Side polycarbonate wings.
      for (const z of [-1.02, 1.02] as const) {
        const wing = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.0, 0.03), polyMat);
        wing.position.set(-0.35, 0.7, z);
        group.add(wing);
        box(group, steel, 0.05, 1.0, 0.05, 0.38, 0.5, z);
        box(group, steel, 0.05, 1.0, 0.05, -1.08, 0.5, z);
      }

      // Mast pair carrying the hub lights and the game clock panel.
      for (const z of [-0.92, 0.92] as const) {
        box(group, black, 0.07, 3.1, 0.07, -0.95, 1.55, z);
        box(group, glowMat, 0.1, 0.22, 0.1, -0.95, 2.62, z, false);
      }
      box(group, black, 0.2, 0.06, 1.9, -0.95, 3.05, 0);
      box(group, steel, 0.05, 0.34, 0.05, -0.95, 3.24, 0);
      for (const z of [-0.92, 0.92] as const) {
        const flag = box(group, allyMat, 0.02, 0.34, 0.5, -0.9, 2.28, z + (z < 0 ? -0.28 : 0.28));
        flag.rotation.x = 0.1;
      }

      // Infeed rollers.
      for (const y of [0.36, 0.52]) {
        const roller = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.62, 12), dark);
        roller.rotation.x = Math.PI / 2;
        roller.position.set(0.94, y, 0);
        group.add(roller);
        for (const z of [-0.83, 0.83] as const) {
          box(group, allyMat, 0.1, 0.1, 0.04, 0.94, y, z);
        }
      }
      box(group, glowMat, 0.05, 0.05, 1.6, 1.18, 0.17, 0, false);
    }
  }

  private addTowers(): void {
    for (const tower of this.field.towers) {
      const group = new THREE.Group();
      group.position.set(tower.x, 0, tower.y);
      group.rotation.y = tower.alliance === 'red' ? 0 : Math.PI;
      this.scene.add(group);
      const allyMat = material(tower.alliance === 'red' ? RED : BLUE, { roughness: 0.44, metalness: 0.35 });
      const steel = material('#dfe5ec', { metalness: 0.55, roughness: 0.35 });
      const dark = material('#242b34', { metalness: 0.5, roughness: 0.45 });

      box(group, dark, 1.5, 0.2, 1.15, 0, 0.1, 0);
      box(group, allyMat, 1.56, 0.06, 1.21, 0, 0.22, 0);
      // Ladder frame facing midfield.
      for (const z of [-0.44, 0.44] as const) {
        box(group, steel, 0.07, 3.0, 0.07, 0.36, 1.55, z);
        beamBetween(group, steel, new THREE.Vector3(-0.36, 0.25, z), new THREE.Vector3(0.36, 3.0, z), 0.06);
      }
      for (let y = 0.45; y < 3.0; y += 0.34) {
        box(group, steel, 0.05, 0.05, 0.88, 0.36, y, 0);
      }
      // Rear brace and top platform.
      for (const z of [-0.4, 0.4] as const) {
        beamBetween(group, steel, new THREE.Vector3(-0.36, 0.2, z), new THREE.Vector3(-0.5, 3.0, z), 0.06);
      }
      box(group, dark, 1.2, 0.08, 0.95, -0.1, 3.0, 0);
      box(group, allyMat, 0.06, 0.55, 0.95, 0.46, 3.3, 0);
      for (const z of [-0.44, 0.44] as const) {
        box(group, steel, 0.05, 0.5, 0.05, -0.6, 3.3, z);
      }
      box(group, steel, 0.05, 0.5, 0.05, -0.6, 3.3, 0);
      const tex = makeTextTexture('TOWER', {
        width: 512,
        height: 128,
        background: tower.alliance === 'red' ? '#8d1125' : '#003d86',
        color: '#ffffff',
        font: '800 62px "Barlow Condensed", "Arial Narrow", sans-serif',
        sub: 'CLIMB',
        accent: '#ffd23f',
      });
      const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.44), mat);
      sign.position.set(-0.1, 2.72, 0.5);
      sign.rotation.y = Math.PI / 2;
      group.add(sign);
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(tower.radius, tower.radius + 0.08, 32),
        new THREE.MeshBasicMaterial({ color: tower.alliance === 'red' ? RED : BLUE, transparent: true, opacity: 0.55 }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(tower.x, 0.02, tower.y);
      this.scene.add(ring);
    }
  }

  private addOutposts(): void {
    const { length: L } = this.field.size;
    for (const outpost of this.field.outposts) {
      const group = new THREE.Group();
      const outside = outpost.alliance === 'red' ? -0.62 : L + 0.62;
      group.position.set(outside, 0, outpost.y);
      group.rotation.y = outpost.alliance === 'red' ? 0 : Math.PI;
      this.scene.add(group);
      const allyMat = material(outpost.alliance === 'red' ? RED : BLUE, { roughness: 0.45 });
      const shell = material('#e4e9ee', { metalness: 0.15, roughness: 0.55 });
      const dark = material('#1a2028', { metalness: 0.5, roughness: 0.4 });

      box(group, shell, 0.95, 0.92, 0.95, 0, 0.46, 0);
      box(group, allyMat, 1.0, 0.08, 1.0, 0, 0.94, 0);
      box(group, allyMat, 1.0, 0.1, 1.0, 0, 0.06, 0);
      box(group, dark, 0.34, 0.26, 0.06, 0.48, 0.62, 0);
      const chute = box(group, shell, 0.5, 0.06, 0.7, 0.66, 0.78, 0);
      chute.rotation.z = 0.2;
      const tex = makeTextTexture('OUTPOST', {
        width: 512,
        height: 160,
        background: outpost.alliance === 'red' ? '#8d1125' : '#003d86',
        color: '#ffffff',
        font: '800 52px "Barlow Condensed", "Arial Narrow", sans-serif',
        sub: 'HUMAN PLAYER',
        border: true,
      });
      const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.82, 0.26), mat);
      sign.position.set(0.49, 0.62, 0);
      sign.rotation.y = Math.PI / 2;
      group.add(sign);
    }
  }

  private addBarriers(): void {
    for (const barrier of this.field.barriers) {
      if (!barrier.width || !barrier.depth) continue;
      const mat = material(barrier.type === 'rail' ? '#d5dde8' : '#5b6773', {
        metalness: 0.5,
        roughness: 0.4,
      });
      box(this.scene, mat, barrier.width, barrier.height, barrier.depth, barrier.x, barrier.height / 2, barrier.y);
    }
  }

  /** Driver stations, the scoring table and the remaining venue dressing. */
  private addSetDressing(): void {
    const { length: L, width: W } = this.field.size;
    const shell = material('#e6eaef', { metalness: 0.12, roughness: 0.6 });
    const frameMat = material('#cdd4dc', { metalness: 0.45, roughness: 0.4 });
    const dark = material('#1b212a', { metalness: 0.45, roughness: 0.45 });
    const deskMat = material('#f3f6f9', { roughness: 0.7, metalness: 0.08 });
    const redMat = material('#a8162c', { roughness: 0.5 });
    const blueMat = material('#0c4b9e', { roughness: 0.5 });
    const blackMat = material('#0c0f14', { roughness: 0.5, metalness: 0.3 });
    const lampMat = new THREE.MeshBasicMaterial({ color: '#fff6e2', toneMapped: false });

    // Three driver stations per alliance, outside the alliance walls.
    for (const alliance of ['red', 'blue'] as const) {
      const facing = alliance === 'red' ? 1 : -1;
      const baseX = alliance === 'red' ? -1.95 : L + 1.95;
      const allyMat = alliance === 'red' ? redMat : blueMat;
      const teams = this.setup.robots
        .filter((robot) => robot.alliance === alliance)
        .sort((a, b) => a.index - b.index);
      for (let index = 0; index < 3; index++) {
        const station = new THREE.Group();
        station.position.set(baseX, 0, W / 2 + (index - 1) * 2.2);
        station.rotation.y = facing === 1 ? 0 : Math.PI;
        this.scene.add(station);
        const team = teams[index];

        box(station, dark, 2.15, 0.1, 1.45, 0, 0.05, 0);
        box(station, shell, 2.0, 0.04, 1.35, 0, 0.11, 0, false);
        box(station, allyMat, 0.07, 0.06, 1.35, 1.0, 0.14, 0, false);
        // Desk, monitor and team display.
        box(station, deskMat, 0.66, 0.62, 1.5, 0.42, 0.42, 0);
        box(station, dark, 0.1, 0.34, 0.52, 0.32, 0.86, 0);
        const screenTex = makeTextTexture(team ? `#${team.teamNumber}` : `${alliance.toUpperCase()} ${index + 1}`, {
          width: 512,
          height: 256,
          background: alliance === 'red' ? '#7b0d1f' : '#06326e',
          color: '#ffffff',
          sub: team ? team.teamName.toUpperCase() : 'DRIVER STATION',
          border: true,
        });
        const screenMat = new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false });
        const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.27), screenMat);
        screen.position.set(0.26, 0.9, 0);
        screen.rotation.y = -Math.PI / 2;
        station.add(screen);

        // Frame, canopy and number board.
        for (const px of [-0.94, 0.94]) {
          for (const pz of [-0.62, 0.62]) {
            box(station, frameMat, 0.05, 2.25, 0.05, px, 1.12, pz, false);
          }
        }
        box(station, shell, 2.05, 0.07, 1.4, 0, 2.24, 0, false);
        box(station, allyMat, 2.05, 0.09, 0.12, 0, 2.16, 0.68, false);
        box(station, lampMat, 0.5, 0.04, 0.5, 0, 2.18, 0, false);
        const boardTex = makeTextTexture(`${alliance.toUpperCase()} ${index + 1}`, {
          width: 512,
          height: 160,
          background: alliance === 'red' ? '#a30f27' : '#00479a',
          color: '#ffffff',
          border: true,
          accent: '#ffd23f',
        });
        const boardMat = new THREE.MeshBasicMaterial({ map: boardTex, toneMapped: false });
        const board = new THREE.Mesh(new THREE.PlaneGeometry(1.45, 0.45), boardMat);
        board.position.set(1.04, 1.88, 0);
        board.rotation.y = Math.PI / 2;
        station.add(board);
      }
    }

    // Scoring table on the far sideline: a dark cabinet under a hanging sign.
    const tableX = L / 2;
    const tableZ = -3.15;
    box(this.scene, blackMat, 4.2, 0.85, 0.75, tableX, 0.43, tableZ);
    box(this.scene, material('#20262f', { roughness: 0.4 }), 4.25, 0.06, 0.8, tableX, 0.88, tableZ, false);
    for (const dx of [-1.7, 1.7]) {
      box(this.scene, blackMat, 0.09, 1.3, 0.09, tableX + dx, 1.6, tableZ);
    }
    const tableTex = makeTextTexture('SCORING TABLE', {
      width: 1024,
      height: 200,
      background: '#0b0e13',
      color: '#eef3f8',
      sub: 'REBUILT · 2026',
      border: true,
      accent: '#ffd23f',
    });
    const tableMat = new THREE.MeshBasicMaterial({ map: tableTex, toneMapped: false });
    const tableSign = new THREE.Mesh(new THREE.PlaneGeometry(3.9, 0.86), tableMat);
    tableSign.position.set(tableX, 1.65, tableZ + 0.05);
    this.scene.add(tableSign);
    for (const [dx, mat] of [[-2.05, redMat], [2.05, blueMat]] as const) {
      box(this.scene, mat, 0.5, 0.12, 0.8, tableX + dx, 0.9, tableZ, false);
    }
  }

  private addRobots(): void {
    for (const robotSetup of this.setup.robots) {
      const visual = createRobotModel(robotSetup.bot, robotSetup.alliance);
      this.scene.add(visual.group);
      const label = this.makeRobotLabel(robotSetup);
      label.position.y = 1.18;
      visual.group.add(label);
      if (robotSetup.id === this.playerRobotId) visual.setHighlight(true);
      const spot = this.field.startingPositions[robotSetup.alliance][robotSetup.index] ?? {
        x: this.field.size.length / 2,
        y: this.field.size.width / 2,
        heading: 0,
      };
      const target: RobotSnapshot = {
        id: robotSetup.id,
        slot: robotSetup.slot,
        x: spot.x,
        y: spot.y,
        heading: spot.heading,
        vx: 0,
        vy: 0,
        carrying: 0,
        intakeActive: false,
        expanded: false,
        climb: { active: false, level: 0, progress: 0, locked: false },
        disabled: false,
        disconnected: false,
        disqualified: false,
        tipped: false,
        pinned: false,
        pinnedFor: 0,
        fuelScored: 0,
        lastInputSeq: 0,
        awardLevel3: false,
      };
      this.robots.set(robotSetup.id, { visual, target, label });
      visual.group.position.set(spot.x, 0, spot.y);
      visual.group.rotation.y = -spot.heading;
    }
  }

  private makeRobotLabel(robot: MatchSetup['robots'][number]): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    const red = robot.alliance === 'red';
    ctx.fillStyle = red ? 'rgba(143,10,29,.92)' : 'rgba(0,57,128,.92)';
    ctx.fillRect(0, 0, 512, 128);
    ctx.strokeStyle = red ? '#ff8b99' : '#7eb6ff';
    ctx.lineWidth = 5;
    ctx.strokeRect(4, 4, 504, 120);
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 54px "Barlow Condensed", "Arial Narrow", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`#${robot.teamNumber}`, 22, 52);
    ctx.font = '600 38px "Inter", sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,.9)';
    ctx.fillText(robot.teamName.slice(0, 18), 22, 98);
    ctx.font = '600 24px "Inter", sans-serif';
    ctx.textAlign = 'right';
    ctx.fillStyle = red ? '#ffd6db' : '#cfe4ff';
    ctx.fillText(robot.controller === 'ai' ? 'AI' : (robot.displayName ?? 'DRIVER').slice(0, 16), 490, 98);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(1.75, 0.44, 1);
    return sprite;
  }

  update(snapshot: MatchSnapshot): void {
    this.snapshot = snapshot;
    for (const state of snapshot.robots) {
      const robot = this.robots.get(state.id);
      if (!robot) continue;
      robot.target = state;
      robot.visual.update(state, this.elapsed);
      const active = !state.disabled && !state.disqualified;
      robot.label.material.opacity = active ? 1 : 0.45;
    }
    this.fuelTargets = snapshot.fuel.map((fuel) => ({ id: fuel.id, x: fuel.x, y: fuel.y, z: fuel.z }));
    for (const alliance of ['red', 'blue'] as const) {
      const active = snapshot.hubActive[alliance];
      for (const mat of this.hubGlow[alliance]) {
        mat.emissiveIntensity = active ? 1.35 : 0.12;
        mat.color.copy(active ? (alliance === 'red' ? RED : BLUE) : new THREE.Color('#4a5260'));
      }
    }
  }

  setCameraMode(mode: CameraMode): void {
    this.cameraMode = mode;
  }

  setFocusRobot(id: string | undefined): void {
    this.focusRobotId = id;
  }

  private resize(): void {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (!width || !height) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  private updateCamera(dt: number, immediate = false): void {
    const target = new THREE.Vector3();
    const look = new THREE.Vector3();
    const field = this.field.size;
    const mode = this.cameraMode === 'driver' && !this.focusRobotId ? 'broadcast' : this.cameraMode;
    const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
    if (mode === 'driver' && this.focusRobotId) {
      const robot = this.robots.get(this.focusRobotId);
      if (robot) {
        const pos = robot.visual.group.position;
        // Use the authoritative heading so the chase camera does not inherit
        // the extra smoothing already applied to the robot mesh.
        const heading = robot.target.heading;
        const forward = new THREE.Vector3(Math.cos(heading), 0, Math.sin(heading));
        // Keep the chase camera inside the perimeter so it never clips the
        // alliance wall or the end signage when a robot backs into a corner.
        target.copy(pos).addScaledVector(forward, -3.1).add(new THREE.Vector3(0, 1.72, 0));
        target.x = clamp(target.x, 0.35, field.length - 0.35);
        target.z = clamp(target.z, 0.35, field.width - 0.35);
        look.copy(pos).addScaledVector(forward, 4.6).add(new THREE.Vector3(0, 0.5, 0));
      }
    }
    if (mode === 'broadcast' || target.lengthSq() === 0) {
      // High three-quarter shot that frames the whole field, driver stations
      // and scoring table the way a broadcast replay would.
      target.set(field.length * 0.82, 8.2, field.width * 2.35);
      look.set(field.length * 0.5, 0.6, field.width * 0.5);
    }
    if (mode === 'field') {
      target.set(field.length / 2, 20.5, field.width / 2 + 1.6);
      look.set(field.length / 2, 0.2, field.width / 2);
    }
    if (mode === 'orbit') {
      const angle = this.elapsed * 0.08 + 0.7;
      target.set(
        field.length / 2 + Math.cos(angle) * 11.5,
        6.0,
        field.width / 2 + Math.sin(angle) * 11.5,
      );
      look.set(field.length / 2, 0.7, field.width / 2);
    }
    // Name plates are only useful when the camera is close to a robot; from
    // the broadcast and top cameras they read as floating banners.
    for (const robot of this.robots.values()) {
      robot.label.visible = mode === 'driver' && robot.target.id !== this.focusRobotId;
    }
    const desiredFov = mode === 'driver' ? 60 : mode === 'field' ? 46 : 46;
    const smoothing = immediate ? 1 : 1 - Math.exp(-(mode === 'driver' ? 9 : 5.5) * dt);
    this.camera.position.lerp(target, smoothing);
    this.cameraLook.lerp(look, smoothing);
    this.camera.lookAt(this.cameraLook);
    if (Math.abs(this.camera.fov - desiredFov) > 0.05) {
      this.camera.fov += (desiredFov - this.camera.fov) * smoothing;
      this.camera.updateProjectionMatrix();
    } else if (this.camera.fov !== desiredFov) {
      this.camera.fov = desiredFov;
      this.camera.updateProjectionMatrix();
    }
  }

  private animate = (): void => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    this.elapsed += dt;
    const smooth = 1 - Math.exp(-10 * dt);
    for (const robot of this.robots.values()) {
      const group = robot.visual.group;
      const tx = robot.target.x;
      const tz = robot.target.y;
      group.position.x += (tx - group.position.x) * smooth;
      group.position.z += (tz - group.position.z) * smooth;
      let desired = -robot.target.heading;
      let delta = (desired - group.rotation.y) % (Math.PI * 2);
      if (delta > Math.PI) delta -= Math.PI * 2;
      if (delta < -Math.PI) delta += Math.PI * 2;
      group.rotation.y += delta * smooth;
      robot.visual.update(robot.target, this.elapsed);
    }
    // Fuel interpolation, keeping shots smooth between 15 Hz snapshots.
    const display = this.fuelDisplay;
    const seen = new Set<number>();
    let count = 0;
    for (const target of this.fuelTargets) {
      seen.add(target.id);
      let pos = display.get(target.id);
      if (!pos) {
        pos = { x: target.x, y: target.y, z: target.z };
        display.set(target.id, pos);
      } else {
        pos.x += (target.x - pos.x) * 0.35;
        pos.y += (target.y - pos.y) * 0.35;
        pos.z += (target.z - pos.z) * 0.35;
      }
      this.fuelDummy.position.set(pos.x, pos.z, pos.y);
      this.fuelDummy.updateMatrix();
      this.fuelMesh.setMatrixAt(count, this.fuelDummy.matrix);
      count++;
      if (count >= this.fuelMesh.instanceMatrix.count) break;
    }
    for (const id of display.keys()) {
      if (!seen.has(id)) display.delete(id);
    }
    this.fuelMesh.count = count;
    this.fuelMesh.instanceMatrix.needsUpdate = true;
    this.updateCamera(dt);
    this.renderer.render(this.scene, this.camera);
  };

  dispose(): void {
    this.renderer.setAnimationLoop(null);
    this.resizeObserver.disconnect();
    for (const robot of this.robots.values()) robot.visual.dispose();
    this.scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh) && !(object instanceof THREE.Sprite)) return;
      object.geometry?.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const mat of materials) {
        if (!mat) continue;
        const m = mat as THREE.MeshStandardMaterial;
        m.map?.dispose();
        m.emissiveMap?.dispose();
        m.normalMap?.dispose();
        m.roughnessMap?.dispose();
        m.metalnessMap?.dispose();
        m.alphaMap?.dispose();
        m.dispose();
      }
    });
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }

  getCanvas(): HTMLCanvasElement {
    return this.renderer.domElement;
  }
}
