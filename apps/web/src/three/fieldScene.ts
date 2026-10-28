import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  REBUILT_2026,
  bumpHeightAt,
  bumpSlopeAt,
  type Alliance,
  type FieldLayout,
  type MatchSetup,
  type MatchSnapshot,
  type RobotSnapshot,
} from '@rebuilt/shared';
import { createRobotModel, type RobotVisual } from './robotModel';
import {
  makeAprilTagTexture,
  makeCarpetBumpTexture,
  makeCarpetTexture,
  makeCarpetWearTexture,
  makeDiamondPlateTexture,
  makeFuelTexture,
  makeHdpeBumpTexture,
  makeHubSign,
  makeNetTexture,
  makeTextTexture,
  makeVenueFloorTexture,
} from './textures';

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
const WHITE = new THREE.Color('#ffffff');

const UP = new THREE.Vector3(0, 1, 0);

/** Corners of the carpet: what the broadcast and top cameras frame. */
function fieldFitPoints(field: FieldLayout): THREE.Vector3[] {
  const { length: L, width: W } = field.size;
  return [
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(L, 0, 0),
    new THREE.Vector3(0, 0, W),
    new THREE.Vector3(L, 0, W),
  ];
}

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
  /** Ball ids drawn this frame; reused so the fuel pass allocates nothing. */
  private readonly fuelSeen = new Set<number>();
  private fuelTargets: Array<{ id: number; x: number; y: number; z: number }> = [];
  private readonly hubGlow: Record<'red' | 'blue', THREE.MeshStandardMaterial[]> = { red: [], blue: [] };
  /** FUEL stacked in each OUTPOST chute, driven by the human player's stock. */
  private readonly chuteFuel: Partial<Record<'red' | 'blue', THREE.InstancedMesh>> = {};
  private cameraMode: CameraMode;
  private focusRobotId?: string;
  private readonly playerRobotId?: string;
  private snapshot: MatchSnapshot | null = null;
  private lastFrame = performance.now();
  private elapsed = 0;
  private readonly cameraLook = new THREE.Vector3();
  private readonly fieldFitPoints: THREE.Vector3[];
  private readonly fitCamera = new THREE.PerspectiveCamera(46, 16 / 9, 0.05, 400);
  private readonly projected = new THREE.Vector3();
  private readonly resizeObserver: ResizeObserver;
  private readonly quality: 'high' | 'balanced';
  private composer: EffectComposer | null = null;
  private bloom: UnrealBloomPass | null = null;
  private postEnabled = true;
  private slowFrames = 0;
  /** HUB/TOWER footprints the chase camera lifts over; the field never moves. */
  private chaseBlockerCache: Array<{ minX: number; maxX: number; minZ: number; maxZ: number; top: number }> | null =
    null;
  /** Scratch vectors for the per-frame camera solve. */
  private readonly tmpTarget = new THREE.Vector3();
  private readonly tmpLook = new THREE.Vector3();
  private readonly tmpDirection = new THREE.Vector3();
  private readonly tmpOffset = new THREE.Vector3();
  private readonly tmpForward = new THREE.Vector3();
  /** Framing distance for the fixed cameras, cached per mode and window shape. */
  private fitCacheKey = '';
  private fitCacheValue = 0;
  /** Venue video boards: one canvas driving every screen in the arena. */
  private boardCanvas: HTMLCanvasElement | null = null;
  private boardCtx: CanvasRenderingContext2D | null = null;
  private boardTexture: THREE.CanvasTexture | null = null;
  private boardKey = '';
  /** Driver-station clocks and the alliance status LED stacks. */
  private readonly stationTimers: Partial<
    Record<Alliance, { ctx: CanvasRenderingContext2D; texture: THREE.CanvasTexture; second: number }>
  > = {};
  private readonly stationLeds: Array<{
    mat: THREE.MeshBasicMaterial;
    alliance: Alliance;
    robotId?: string;
    mode: 'off' | 'blink' | 'solid';
    phase: number;
  }> = [];
  private readonly stationAmber: THREE.MeshBasicMaterial[] = [];
  /** HUB light state, so the DMX bars can chase and pulse off the real state. */
  private readonly hubActiveState: Record<Alliance, boolean> = { red: true, blue: true };
  private readonly hubChangeAt: Record<Alliance, number> = { red: -99, blue: -99 };

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
    this.renderer.toneMappingExposure = 0.95;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.className = 'field-canvas';
    this.renderer.domElement.setAttribute('aria-label', 'REBUILT field simulation');
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    // Fog starts past the venue rig so the arena stays crisp at every size,
    // and it is dark enough to read as an indoor venue rather than daylight.
    this.scene.fog = new THREE.Fog(
      0x0d141c,
      Math.max(26, this.field.size.length * 1.9),
      Math.max(80, this.field.size.length * 4.6),
    );
    // A prefiltered studio environment gives the aluminium, polycarbonate and
    // powder coat real specular response instead of reading as flat colour.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const environment = pmrem.fromScene(new RoomEnvironment(), 0.05);
    this.scene.environment = environment.texture;
    this.scene.environmentIntensity = 0.34;
    pmrem.dispose();
    this.camera = new THREE.PerspectiveCamera(
      46,
      (container.clientWidth || 1) / (container.clientHeight || 1),
      0.08,
      240,
    );
    this.camera.position.set(this.field.size.length * 0.82, 8.2, this.field.size.width * 2.35);
    this.cameraLook.set(this.field.size.length * 0.5, 0.6, this.field.size.width * 0.5);
    this.fieldFitPoints = fieldFitPoints(this.field);
    this.fitCamera.aspect = this.camera.aspect;

    this.setupPostProcessing();
    this.addSky();
    this.addLights();
    this.addArena();
    this.addField();
    this.addBumps();
    this.addTrenches();
    this.addDepots();
    this.addHubs();
    this.addTowers();
    this.addOutposts();
    this.addBarriers();
    this.addSetDressing();
    this.addFieldStaff();
    this.addGrandstand();
    this.addVenueRig();
    this.addOverheadRig();
    this.addRobots();

    const staged = this.field.fuelSpawns.reduce((n, s) => n + s.count, 0);
    // A standard match stages 504 FUEL: 360 corralled on the CENTER LINE, 24 in
    // each DEPOT and 24 in each OUTPOST CHUTE (600, with 456 corralled, on the
    // Championship field). Leave room for the HUBs ejecting FUEL back onto the
    // field and for human feeds, as well as the kickoff staging.
    const maxFuel = Math.min(760, Math.round(staged * 1.45) + 24);
    // Official FUEL is a 5.91 in (150 mm) yellow foam ball with printed marks.
    this.fuelMesh = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.075, 14, 12),
      material('#ffffff', {
        map: makeFuelTexture(),
        roughness: 0.94,
        metalness: 0.02,
      }),
      maxFuel,
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

  /**
   * Bloom is what makes the LED trim, HUB rims and the hanging video board read
   * as light sources instead of flat coloured boxes. Balanced quality skips it.
   */
  private setupPostProcessing(): void {
    if (this.quality !== 'high') {
      this.postEnabled = false;
      return;
    }
    const size = this.renderer.getSize(new THREE.Vector2());
    this.composer = new EffectComposer(this.renderer);
    this.composer.setSize(size.x || 1, size.y || 1);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x || 1, size.y || 1), 0.42, 0.7, 0.86);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  private addSky(): void {
    const geo = new THREE.SphereGeometry(220, 32, 20);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        top: { value: new THREE.Color('#050a10') },
        bottom: { value: new THREE.Color('#1a2833') },
        glow: { value: new THREE.Color('#2f4660') },
      },
      vertexShader: `varying vec3 vWorld; void main(){ vWorld = (modelMatrix * vec4(position,1.0)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `varying vec3 vWorld; uniform vec3 top; uniform vec3 bottom; uniform vec3 glow; void main(){ vec3 dir = normalize(vWorld); float h = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0); vec3 col = mix(bottom, top, smoothstep(0.46, 0.95, h)); float sun = pow(max(dot(dir, normalize(vec3(0.45, 0.35, 0.82))), 0.0), 10.0); col += glow * sun * 0.45; col = mix(col, glow * 1.05, (1.0 - smoothstep(0.44, 0.53, h)) * 0.3); gl_FragColor = vec4(col, 1.0); }`,
    });
    this.scene.add(new THREE.Mesh(geo, mat));
  }

  private addLights(): void {
    const { length: L, width: W } = this.field.size;
    const center = new THREE.Vector3(L / 2, 0, W / 2);
    // Arena wash: a cool hemisphere plus a little ambient so the venue around
    // the carpet never crushes to black. Deliberately dim compared with the
    // key, which is what gives the structures their contrast on camera.
    this.scene.add(new THREE.HemisphereLight(0x9fc0e6, 0x23282f, 0.36));
    this.scene.add(new THREE.AmbientLight(0x8fa6bf, 0.08));

    // Key light aimed at the middle of the field so the shadow frustum covers
    // the whole carpet and the corner structures stay lit.
    const key = new THREE.DirectionalLight(0xfff0d8, 2.0);
    key.position.set(center.x + 7, 17, center.z + 9);
    key.target.position.copy(center);
    key.castShadow = this.quality === 'high';
    key.shadow.mapSize.set(2048, 2048);
    const span = Math.max(L, W) * 0.82 + 4.5;
    key.shadow.camera.left = -span;
    key.shadow.camera.right = span;
    key.shadow.camera.top = span;
    key.shadow.camera.bottom = -span;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 60;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.028;
    this.scene.add(key);
    this.scene.add(key.target);

    const fill = new THREE.DirectionalLight(0xc2d8f0, 0.55);
    fill.position.set(center.x - 9, 8, center.z - 8);
    fill.target.position.copy(center);
    this.scene.add(fill);
    this.scene.add(fill.target);

    // Bounce card under the far stand: lifts the shadow side of the HUBs,
    // TRENCHes and robots without another shadow-casting light.
    const bounce = new THREE.DirectionalLight(0xb4c8dd, 0.3);
    bounce.position.set(center.x, -3, center.z - 12);
    bounce.target.position.copy(center);
    this.scene.add(bounce);
    this.scene.add(bounce.target);

    // Alliance-coloured rims lift the two ends out of the flat grey.
    const redRim = new THREE.DirectionalLight(0xff5568, 0.46);
    redRim.position.set(-9, 4.5, W / 2);
    redRim.target.position.copy(center);
    this.scene.add(redRim);
    this.scene.add(redRim.target);
    const blueRim = new THREE.DirectionalLight(0x4f92ff, 0.46);
    blueRim.position.set(L + 9, 4.5, W / 2);
    blueRim.target.position.copy(center);
    this.scene.add(blueRim);
    this.scene.add(blueRim.target);
  }

  private addArena(): void {
    const { length: L, width: W } = this.field.size;
    const cx = L / 2;
    const cz = W / 2;

    // Venue floor: the worn concrete slab the carpet is laid on. It runs well
    // past the fog line so there is no hard horizon inside the broadcast frame.
    const floorW = Math.max(160, L + 60);
    const floorD = Math.max(160, W + 60);
    const venueTex = makeVenueFloorTexture();
    venueTex.repeat.set(floorW / 9, floorD / 9);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(floorW, floorD),
      new THREE.MeshStandardMaterial({ map: venueTex, color: '#5d646c', roughness: 0.94, metalness: 0.03 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(cx, -0.06, cz);
    floor.receiveShadow = true;
    this.scene.add(floor);

    // Painted walkway between the field walls and the safety fence.
    const apron = new THREE.Mesh(
      new THREE.PlaneGeometry(L + 8.8, W + 8.8),
      new THREE.MeshStandardMaterial({ color: '#3b424a', roughness: 0.92, metalness: 0.04 }),
    );
    apron.rotation.x = -Math.PI / 2;
    apron.position.set(cx, -0.028, cz);
    apron.receiveShadow = true;
    this.scene.add(apron);

    const paint = (mat: THREE.Material, x: number, z: number, sx: number, sz: number) => {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(sx, sz), mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(x, -0.02, z);
      this.scene.add(mesh);
    };
    const hazardMat = new THREE.MeshBasicMaterial({ color: '#b8952f' });
    const edgeMat = new THREE.MeshBasicMaterial({ color: '#aeb8c2' });
    // Hazard dashes marking the keep-out line around the apron.
    for (let x = 0.9; x < L + 3.6; x += 1.5) {
      paint(hazardMat, x, -3.6, 0.72, 0.13);
      paint(hazardMat, x, W + 3.6, 0.72, 0.13);
    }
    for (let z = 0.9; z < W + 3.6; z += 1.5) {
      paint(hazardMat, -3.6, z, 0.13, 0.72);
      paint(hazardMat, L + 3.6, z, 0.13, 0.72);
    }
    paint(edgeMat, cx, -3.82, L + 5.4, 0.05);
    paint(edgeMat, cx, W + 3.82, L + 5.4, 0.05);
    paint(edgeMat, -3.82, cz, 0.05, W + 5.4);
    paint(edgeMat, L + 3.82, cz, 0.05, W + 5.4);

    // Fence line: white safety railing around the field, like the real venue.
    const postMat = material('#d3dae1', { metalness: 0.12, roughness: 0.62 });
    const railMat = material('#dee4ea', { metalness: 0.14, roughness: 0.55 });
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
    // Keep the carpet weave at a constant physical size on any field size.
    carpetTex.repeat.set(Math.max(4, Math.round(L * 0.6)), Math.max(3, Math.round(W * 0.6)));
    const carpetBump = makeCarpetBumpTexture();
    carpetBump.repeat.set(Math.max(120, Math.round(L * 8)), Math.max(60, Math.round(W * 8)));
    const carpet = new THREE.Mesh(
      new THREE.PlaneGeometry(L, W),
      new THREE.MeshStandardMaterial({
        map: carpetTex,
        bumpMap: carpetBump,
        bumpScale: 0.12,
        roughness: 0.98,
        metalness: 0.02,
      }),
    );
    carpet.rotation.x = -Math.PI / 2;
    carpet.position.set(cx, 0, cz);
    carpet.receiveShadow = true;
    this.scene.add(carpet);

    // Used carpet: the roll seam, taped repairs and rubber scuffs sit just
    // above the pile, so the field looks driven on instead of freshly laid.
    const wear = new THREE.Mesh(
      new THREE.PlaneGeometry(L, W),
      new THREE.MeshBasicMaterial({
        map: makeCarpetWearTexture(L, W),
        transparent: true,
        depthWrite: false,
        toneMapped: false,
        opacity: 0.6,
      }),
    );
    wear.rotation.x = -Math.PI / 2;
    wear.position.set(cx, 0.0025, cz);
    wear.renderOrder = 1;
    this.scene.add(wear);

    // The seam itself is secured with 2 in gaff tape (§5.2), so the raised
    // band is light tape rather than a dark gap between rolls.
    const seam = new THREE.Mesh(
      new THREE.BoxGeometry(L, 0.0018, 0.051),
      new THREE.MeshStandardMaterial({ color: '#8b8f96', roughness: 0.86, metalness: 0.02 }),
    );
    seam.position.set(cx, 0.006, cz);
    this.scene.add(seam);

    // Field markings are 2 in gaffer tape, exactly as §5.3 specifies: a white
    // CENTER LINE, alliance-coloured ROBOT STARTING LINEs at the edge of each
    // ALLIANCE ZONE and the white HUMAN STARTING LINE 24 in off each wall.
    const lineMat = new THREE.MeshBasicMaterial({ color: '#e8eef5' });
    const redLine = new THREE.MeshBasicMaterial({ color: '#d92b41' });
    const blueLine = new THREE.MeshBasicMaterial({ color: '#2d79ff' });
    const tapeWidth = 0.051;
    const addTape = (mat: THREE.Material, x: number, z: number, sx: number, sz: number) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.003, sz), mat);
      mesh.position.set(x, 0.012, z);
      mesh.receiveShadow = true;
      this.scene.add(mesh);
    };
    // CENTER LINE: white tape bisecting the NEUTRAL ZONE (§5.3).
    addTape(lineMat, cx, cz, tapeWidth, W);
    // ROBOT STARTING LINEs at the edge of each ALLIANCE ZONE, 158.6 in in.
    // That is also the HUB centre line, so the tape emerges from under the HUB
    // on both sides and the zoned depth matches the manual exactly.
    const startLine = L * (158.6 / 651.2);
    addTape(redLine, startLine, cz, tapeWidth, W);
    addTape(blueLine, L - startLine, cz, tapeWidth, W);
    // HUMAN STARTING LINEs are 24 in off each alliance wall but only span the
    // ALLIANCE AREA up to the OUTPOST AREA, not the full width (§5.3).
    const humanLine = L * (24 / 651.2);
    const outpostArea = 71 * 0.0254;
    const humanSpan = W - outpostArea;
    addTape(lineMat, humanLine, outpostArea + humanSpan / 2, tapeWidth, humanSpan);
    addTape(lineMat, L - humanLine, humanSpan / 2, tapeWidth, humanSpan);
    // OUTPOST AREA: 71 x 134 in at one corner of each end, bounded by white
    // tape with the ALLIANCE-coloured line just outside it (§5.3).
    const outpostDepth = 134 * 0.0254;
    addTape(lineMat, outpostDepth / 2, outpostArea, outpostDepth, tapeWidth);
    addTape(redLine, outpostDepth / 2, outpostArea + 0.16, outpostDepth, tapeWidth);
    addTape(lineMat, L - outpostDepth / 2, W - outpostArea, outpostDepth, tapeWidth);
    addTape(blueLine, L - outpostDepth / 2, W - outpostArea - 0.16, outpostDepth, tapeWidth);

    // Field perimeter. The long sides are 20 in clear polycarbonate guardrails
    // on aluminium extrusion with four 38 in robot access gates (§5.2), not the
    // solid walls of an older field.
    const postMat = material('#c3cbd4', { metalness: 0.72, roughness: 0.3 });
    const railMat = material('#e2e8ef', { metalness: 0.6, roughness: 0.26 });
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: '#cfe4f5',
      transparent: true,
      opacity: 0.13,
      roughness: 0.04,
      metalness: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const guardH = Math.max(0.3, Math.min(wallHeight, 0.9));
    const gateMat = material('#3a424b', { metalness: 0.4, roughness: 0.55 });
    const railGlow = new THREE.MeshBasicMaterial({ color: '#9fd8ff', toneMapped: false });
    // Corner posts, bolt plates and knitted corner guards tie the four runs of
    // guardrail together the way the welded field frame does.
    const cornerPlate = new THREE.MeshStandardMaterial({ color: '#8e979f', metalness: 0.7, roughness: 0.34 });
    for (const x of [0, L]) {
      for (const z of [0, W]) {
        box(this.scene, postMat, 0.11, guardH + 0.04, 0.11, x, (guardH + 0.04) / 2, z);
        box(this.scene, cornerPlate, 0.34, 0.018, 0.34, x, 0.009, z, false);
        box(this.scene, railMat, 0.075, 0.05, 0.4, x, guardH - 0.02, z + (z === 0 ? 0.14 : -0.14), false);
        box(this.scene, railMat, 0.4, 0.05, 0.075, x + (x === 0 ? 0.14 : -0.14), guardH - 0.02, z, false);
      }
    }
    for (const z of [0, W]) {
      box(this.scene, railMat, L, 0.05, 0.075, cx, 0.025, z);
      box(this.scene, railMat, L, 0.045, 0.085, cx, guardH - 0.02, z);
      box(this.scene, railGlow, L, 0.012, 0.02, cx, guardH - 0.058, z, false);
      const gates = z < 1 ? [L * 0.33, L * 0.67] : [L * 0.26, L * 0.74];
      const spacing = 2.4;
      for (let start = 0; start < L - 0.01; start += spacing) {
        const end = Math.min(L, start + spacing);
        if (!gates.some((gate) => start < gate + 0.62 && end > gate - 0.62)) {
          const panel = new THREE.Mesh(
            new THREE.BoxGeometry(end - start - 0.08, guardH - 0.12, 0.012),
            glassMat,
          );
          panel.position.set((start + end) / 2, (guardH - 0.12) / 2 + 0.06, z);
          this.scene.add(panel);
        }
        box(this.scene, postMat, 0.055, guardH, 0.09, end, guardH / 2, z);
      }
      for (const gate of gates) {
        // Four gates per field, closed and shielded during a match (§5.2). The
        // shield is a clear panel in an aluminium frame with a latch and hinge
        // pins, not an open gap in the guardrail.
        box(this.scene, glassMat, 0.9, guardH - 0.13, 0.014, gate, (guardH - 0.13) / 2 + 0.065, z, false);
        box(this.scene, railMat, 0.96, 0.055, 0.07, gate, guardH - 0.035, z, false);
        box(this.scene, railMat, 0.96, 0.045, 0.07, gate, 0.045, z, false);
        for (const dz of [-0.46, 0.46]) {
          box(this.scene, postMat, 0.055, guardH, 0.1, gate + dz, guardH / 2, z);
          // Hinge barrels on the outboard stile and the latch handle inboard.
          box(this.scene, gateMat, 0.085, 0.075, 0.085, gate + dz, 0.16, z, false);
          box(this.scene, gateMat, 0.085, 0.075, 0.085, gate + dz, guardH - 0.16, z, false);
        }
        const latch = box(this.scene, railMat, 0.09, 0.022, 0.022, gate + 0.4, guardH * 0.55, z + 0.055, false);
        latch.rotation.z = 0.3;
        // Hazard band along the bottom rail, as the field crew marks the gate.
        box(this.scene, gateMat, 0.6, 0.06, 0.012, gate, 0.115, z + 0.042, false);
      }
    }

    // ALLIANCE WALLs: a sponsor panel to bumper height, clear panels above, and
    // the TOWER wall between driver stations 2 and 3.
    for (const alliance of ['red', 'blue'] as const) {
      const x = alliance === 'red' ? -0.055 : L + 0.055;
      const baseMat = material(alliance === 'red' ? '#9c1529' : '#0a3d84', {
        roughness: 0.62,
        metalness: 0.08,
      });
      const sponsorMat = material('#121920', { roughness: 0.55, metalness: 0.2 });
      box(this.scene, baseMat, 0.11, 0.62, W, x, 0.31, cz);
      box(this.scene, sponsorMat, 0.13, 0.13, W, x, 0.69, cz);
      for (let z = 1.2; z < W - 0.9; z += 2.45) {
        box(
          this.scene,
          new THREE.MeshBasicMaterial({ color: '#e8eef4' }),
          0.014,
          0.065,
          1.15,
          x + (alliance === 'red' ? 0.07 : -0.07),
          0.69,
          z,
          false,
        );
      }
      box(this.scene, glassMat, 0.018, 1.0, W, x, 1.28, cz, false);
      for (let z = 0; z <= W; z += 2.2) {
        box(this.scene, postMat, 0.05, 1.0, 0.05, x, 1.28, z);
      }
      box(this.scene, railMat, 0.075, 0.05, W, x, 1.8, cz, false);
      box(
        this.scene,
        new THREE.MeshBasicMaterial({ color: alliance === 'red' ? '#ff3149' : '#2f7bff', toneMapped: false }),
        0.03,
        0.035,
        W - 0.6,
        x,
        1.9,
        cz,
        false,
      );
    }
  }

  /**
   * The 2026 BUMPs: two 15° HDPE ramps meeting at a ridge, one pair beside
   * each HUB. They are drivable rather than solid, so they are drawn with a
   * prism profile and the renderer pitches robots that cross them.
   */
  private addBumps(): void {
    const hdpeBump = makeHdpeBumpTexture();
    for (const bump of this.field.bumps ?? []) {
      const group = new THREE.Group();
      group.position.set(bump.x, 0, bump.y);
      this.scene.add(group);

      const halfD = bump.depth / 2;
      const halfW = bump.width / 2;
      const h = bump.height;
      const allyColor = bump.alliance === 'red' ? '#c2122f' : '#0b4ea6';
      const hdpe = new THREE.MeshStandardMaterial({
        color: allyColor,
        roughness: 0.72,
        metalness: 0.03,
        bumpMap: hdpeBump,
        bumpScale: 0.9,
        flatShading: true,
      });
      const frame = material('#262c34', { roughness: 0.62, metalness: 0.35 });
      const trim = material('#cbd3dc', { metalness: 0.75, roughness: 0.32 });

      // Each BUMP is two 1/2 in HDPE ramps at 15° meeting under a flat ridge
      // cap (§5.5). Building the ramps as angled slabs instead of one prism
      // keeps the ridge a hard line and lets the orange-peel texture sit on
      // the drive surface where the robots actually ride.
      const capHalf = 0.028;
      const run = halfD - capHalf;
      const slope = Math.atan2(h, run);
      const rampLen = Math.hypot(run, h) + 0.01;
      for (const dir of [-1, 1]) {
        const ramp = new THREE.Mesh(new THREE.BoxGeometry(rampLen, 0.04, bump.width), hdpe);
        const midX = dir * (capHalf + run / 2);
        const midY = h / 2;
        const nx = dir * (h / Math.hypot(run, h));
        const ny = run / Math.hypot(run, h);
        ramp.position.set(midX - nx * 0.02, midY - ny * 0.02, 0);
        ramp.rotation.z = dir * -slope;
        ramp.castShadow = true;
        ramp.receiveShadow = true;
        group.add(ramp);
      }
      // Flat ridge cap between the two ramps, capped by a light joint strip so
      // the 6.5 in peak reads from the broadcast camera.
      box(group, hdpe, capHalf * 2 + 0.02, 0.03, bump.width, 0, h - 0.014, 0);
      box(group, frame, capHalf * 2 - 0.012, 0.006, bump.width - 0.02, 0, h + 0.003, 0, false);
      // Dark rubber skirt around the whole footprint: the edge line that makes
      // the BUMP legible as a raised structure instead of paint on the carpet.
      for (const side of [-1, 1]) {
        box(group, frame, bump.depth + 0.05, 0.03, 0.03, 0, 0.015, side * (halfW + 0.014), false);
        box(group, frame, 0.03, 0.03, bump.width + 0.05, side * (halfD + 0.014), 0.015, 0, false);
      }

      // Vertical end plates: 1/2 in HDPE cut to the ramp profile.
      const outline = new THREE.Shape();
      outline.moveTo(-halfD, 0);
      outline.lineTo(-capHalf, h - 0.014);
      outline.lineTo(capHalf, h - 0.014);
      outline.lineTo(halfD, 0);
      outline.lineTo(-halfD, 0);
      const plateGeo = new THREE.ExtrudeGeometry(outline, { depth: 0.03, bevelEnabled: false });
      plateGeo.translate(0, 0.006, -0.015);
      for (const side of [-1, 1]) {
        const plate = new THREE.Mesh(plateGeo, frame);
        plate.position.set(0, 0, side * halfW);
        plate.castShadow = true;
        plate.receiveShadow = true;
        group.add(plate);
      }
      // Bolted flanges holding the HDPE to the frame, plus the carpet edging.
      const boltGeo = new THREE.CylinderGeometry(0.01, 0.01, 0.01, 6);
      for (const side of [-1, 1]) {
        box(group, frame, bump.depth - 0.02, 0.03, 0.05, 0, 0.015, side * (halfW - 0.025), false);
        // Flange bolts along the carpet edge of the HDPE.
        for (let i = -3; i <= 3; i++) {
          const bolt = new THREE.Mesh(boltGeo, trim);
          bolt.position.set((i / 3.4) * (halfD - 0.08), 0.03, side * (halfW - 0.025));
          group.add(bolt);
        }
        // Skirt along the carpet so the ramp base reads as a solid assembly.
        box(group, frame, bump.depth + 0.02, 0.012, 0.012, 0, 0.006, side * (halfW + 0.006), false);
      }
      for (const dir of [-1, 1]) {
        box(group, frame, 0.012, 0.012, bump.width, dir * (halfD + 0.006), 0.006, 0, false);
      }
      // No painted stripes on the BUMP: the drive surface is plain
      // alliance-coloured HDPE with an orange-peel finish (§5.5).
    }
  }

  /**
   * TRENCHes: 40.25 in overhead structures running from each guardrail in
   * towards the BUMPs. The housing holds the HUB electronics and the pivoting
   * arm; the field-facing side carries an AprilTag and a polycarbonate window.
   */
  private addTrenches(): void {
    // Two AprilTags per TRENCH on brackets above the arm, one facing the
    // ALLIANCE ZONE and one facing the NEUTRAL ZONE (§5.11).
    const tagPairs: Record<string, [number, number]> = {
      'red-trench-south': [1, 6],
      'red-trench-north': [7, 12],
      'blue-trench-south': [17, 22],
      'blue-trench-north': [23, 28],
    };
    for (const trench of this.field.trenches ?? []) {
      const group = new THREE.Group();
      group.position.set(trench.x, 0, trench.y);
      this.scene.add(group);
      const allyMat = material(trench.alliance === 'red' ? RED : BLUE, {
        roughness: 0.44,
        metalness: 0.3,
      });
      const alu = material(ALUMINIUM, { metalness: 0.78, roughness: 0.28 });
      const dark = material('#1d232b', { roughness: 0.5, metalness: 0.4 });
      const panel = material('#3b4552', { roughness: 0.44, metalness: 0.38 });
      const glass = new THREE.MeshPhysicalMaterial({
        color: '#cfe4f5',
        transparent: true,
        opacity: 0.2,
        roughness: 0.05,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      // `width` runs inboard from the guardrail and `depth` along the field,
      // so the frame stands across the drive direction and the arm spans it.
      // A pair of goalpost frames with an arm across the top: 65.65 in across
      // the field, 47 in along it, 40.25 in to the top of the arm, and a
      // 50.34 x 22.25 in drive-through under the arm (§5.6). The frames are
      // deliberately thin so the opening stays open from every camera.
      const halfD = trench.depth / 2;
      const clearW = 1.279;
      const clearH = 0.565;
      const legW = (trench.width - clearW) / 2;
      const legZ = clearW / 2 + legW / 2;
      const nearTable = trench.y < this.field.size.width / 2;
      const legMat = material('#7b848f', { metalness: 0.62, roughness: 0.44 });

      for (const sz of [-1, 1]) {
        for (const sx of [-1, 1]) {
          box(group, legMat, 0.085, trench.height, 0.085, sx * (halfD - 0.06), trench.height / 2, sz * legZ);
          box(group, dark, 0.24, 0.03, 0.24, sx * (halfD - 0.06), 0.015, sz * legZ, false);
        }
        box(group, alu, trench.depth, 0.075, 0.075, 0, clearH + 0.02, sz * legZ);
        box(group, alu, trench.depth, 0.05, 0.05, 0, 0.09, sz * legZ, false);
        // Gussets where the arm lands on the frames.
        for (const sx of [-1, 1]) {
          beamBetween(
            group,
            alu,
            new THREE.Vector3(sx * (halfD - 0.06), clearH - 0.12, sz * legZ),
            new THREE.Vector3(sx * 0.2, clearH + 0.04, sz * legZ),
            0.045,
          );
        }
      }
      // The arm itself, its cable tray, and the rubber bumper at robot height.
      box(group, alu, 0.24, 0.085, trench.width, 0, clearH + 0.06, 0);
      box(group, dark, 0.16, 0.04, trench.width - 0.12, 0, clearH + 0.12, 0, false);
      for (const sx of [-1, 1]) {
        box(group, dark, 0.02, 0.05, clearW, sx * 0.13, clearH + 0.01, 0, false);
      }
      if (nearTable) {
        // The TRENCHes on the scoring-table side carry the extra electronics
        // that reach the HUB (§5.6): a louvred cabinet on the arm with the
        // drivers and radio inside, and a window facing each zone.
        box(group, panel, 0.42, 0.3, trench.width * 0.62, 0, clearH + 0.28, 0);
        box(group, dark, 0.46, 0.035, trench.width * 0.62 + 0.03, 0, trench.height - 0.02, 0, false);
        for (const sz of [-1, 1]) {
          box(group, allyMat, 0.42, 0.045, 0.05, 0, clearH + 0.36, sz * (trench.width * 0.31), false);
          box(group, material('#242a32', { roughness: 0.6 }), 0.14, 0.07, 0.2, 0, trench.height + 0.02, sz * 0.34, false);
        }
        const conduit = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, clearH + 0.3, 8), dark);
        conduit.position.set(halfD - 0.06, (clearH + 0.3) / 2, -legZ);
        group.add(conduit);
        for (const sx of [-1, 1]) {
          const window = new THREE.Mesh(new THREE.PlaneGeometry(trench.width * 0.5, 0.19), glass);
          window.position.set(sx * 0.212, clearH + 0.28, 0);
          window.rotation.y = sx > 0 ? Math.PI / 2 : -Math.PI / 2;
          group.add(window);
        }
      } else {
        // The far side has the pivot arm instead: the horizontal section swings
        // up after the match for robot retrieval and is locked flat in play.
        for (const sx of [-1, 1]) {
          const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.05, 14), alu);
          hinge.rotation.x = Math.PI / 2;
          hinge.position.set(sx * (halfD - 0.1), clearH + 0.12, legZ);
          group.add(hinge);
          box(group, allyMat, 0.1, 0.1, 0.16, sx * (halfD - 0.1), clearH + 0.24, legZ, false);
        }
        box(group, dark, 0.18, 0.14, 0.28, -halfD + 0.08, clearH + 0.2, -legZ, false);
        beamBetween(
          group,
          alu,
          new THREE.Vector3(-halfD + 0.12, clearH + 0.18, -legZ),
          new THREE.Vector3(-0.2, clearH + 0.11, -legZ * 0.6),
          0.04,
        );
      }
      // Status strip just under the arm, on both approaches.
      for (const sx of [-1, 1]) {
        box(
          group,
          new THREE.MeshBasicMaterial({ color: '#9fd8ff', toneMapped: false }),
          0.02,
          0.014,
          clearW * 0.72,
          sx * 0.13,
          clearH + 0.015,
          0,
          false,
        );
      }
      // AprilTag brackets at ~35 in above the carpet, one facing each zone.
      const pair = tagPairs[trench.id] ?? [1, 6];
      for (const sx of [-1, 1] as const) {
        box(group, alu, 0.05, 0.3, 0.05, sx * 0.16, clearH + 0.2, 0.56, false);
        box(group, material('#e9eef4', { roughness: 0.6 }), 0.012, 0.267, 0.267, sx * 0.29, 0.889, 0.56, false);
        const tag = new THREE.Mesh(
          new THREE.PlaneGeometry(0.206, 0.206),
          new THREE.MeshBasicMaterial({ map: makeAprilTagTexture(sx > 0 ? pair[0] : pair[1]), toneMapped: false }),
        );
        tag.position.set(sx * 0.298, 0.889, 0.56);
        tag.rotation.y = sx > 0 ? Math.PI / 2 : -Math.PI / 2;
        group.add(tag);
      }
    }
  }

  /**
   * DEPOTs: 42 in x 27 in FUEL corrals built from 3 in wide, 1 in high steel
   * barriers with hook fastener under them, 1.125 in installed height (§5.7).
   */
  private addDepots(): void {
    const fuelTex = makeFuelTexture();
    const fuel = new THREE.MeshStandardMaterial({ map: fuelTex, roughness: 0.9, metalness: 0.02 });
    const yellowLine = new THREE.MeshBasicMaterial({ color: '#f5c33b' });
    for (const depot of this.field.depots ?? []) {
      const group = new THREE.Group();
      group.position.set(depot.x, 0, depot.y);
      group.rotation.y = depot.rotation;
      this.scene.add(group);
      const rail = material('#c3cbd4', { metalness: 0.72, roughness: 0.3 });
      const hook = material('#b9b19c', { roughness: 0.95 });
      const halfD = depot.depth / 2;
      const halfW = depot.width / 2;
      // Three barriers: closed at the wall, open to the field.
      for (const [sx, sz, w, d] of [
        [-halfD, 0, 0.078, depot.width],
        [0, -halfW, depot.depth, 0.078],
        [0, halfW, depot.depth, 0.078],
      ] as const) {
        box(group, rail, w, 0.028, d, sx, 0.014, sz);
        box(group, hook, w + 0.006, 0.007, d + 0.006, sx, 0.031, sz, false);
      }
      // The DEPOT's 24 staged FUEL are real simulation balls, drawn by the
      // FUEL instanced mesh, so the corral empties as robots take from it.
      // Painted keep-out line under the open side.
      box(group, yellowLine, 0.03, 0.003, depot.width, halfD + 0.1, 0.011, 0, false);
    }
  }

  /**
   * The HUB: a 47 in square tower with a hexagonal funnel on top (§5.4). The
   * opening's front edge sits 72 in above the carpet, the top angles carry the
   * DMX bars that signal HUB status, and four exits at the base face the
   * neutral zone so FUEL can be cycled back into play.
   */
  private addHubs(): void {
    const rimY = REBUILT_2026.hub.rimHeight;
    // Two AprilTags per face at 44.25 in above the floor, one centred and one
    // offset (§5.11). Eight tags per HUB.
    const tagIds: Record<'red' | 'blue', number[][]> = {
      red: [[2, 3], [4, 5], [8, 9], [10, 11]],
      blue: [[18, 19], [20, 21], [24, 25], [26, 27]],
    };
    for (const hub of this.field.hubs) {
      const group = new THREE.Group();
      group.position.set(hub.x, 0, hub.y);
      group.rotation.y = hub.rotation;
      this.scene.add(group);

      const allianceColor = hub.alliance === 'red' ? RED : BLUE;
      const dark = material('#1c222a', { metalness: 0.5, roughness: 0.46 });
      const black = material('#0a0d12', { metalness: 0.35, roughness: 0.58 });
      const steel = material(ALUMINIUM, { metalness: 0.8, roughness: 0.28 });
      const allyMat = material(allianceColor, { roughness: 0.4, metalness: 0.3 });
      const allyDark = material(allianceColor.clone().multiplyScalar(0.55), { roughness: 0.5, metalness: 0.3 });
      const glowMat = material(allianceColor, {
        emissive: allianceColor,
        emissiveIntensity: 1.4,
        roughness: 0.3,
      });
      const netTex = makeNetTexture();
      netTex.repeat.set(2.5, 2.5);
      const netMat = new THREE.MeshBasicMaterial({
        map: netTex,
        color: '#b9c4d1',
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      // Frame of the net cage: dark powder coat, not bright aluminium, so it
      // reads as a black backstop instead of white scaffolding.
      const netFrame = material('#2b323b', { metalness: 0.45, roughness: 0.55 });
      this.hubGlow[hub.alliance].push(glowMat);

      // The HUB body is a 47 in square prism; the funnel above it tapers to the
      // 41.7 in hexagonal opening whose front edge is 72 in off the carpet.
      const half = 0.597;
      const bodyTop = 1.3;
      box(group, black, half * 2 + 0.1, 0.1, half * 2 + 0.1, 0, 0.05, 0);
      box(group, material('#3f4650', { roughness: 0.95 }), half * 2 + 0.02, 0.012, half * 2 + 0.02, 0, 0.104, 0, false);
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          box(group, steel, 0.06, bodyTop - 0.1, 0.06, sx * (half - 0.028), 0.1 + (bodyTop - 0.1) / 2, sz * (half - 0.028));
          box(group, steel, 0.11, 0.02, 0.11, sx * (half - 0.028), 0.01, sz * (half - 0.028), false);
        }
      }
      // Lower chassis band, with four FUEL exits on the neutral-zone face.
      for (const sz of [-1, 1]) box(group, dark, half * 2, 0.3, 0.04, 0, 0.25, sz * half);
      for (const sx of [-1, 1]) box(group, dark, 0.04, 0.3, half * 2, sx * half, 0.25, 0);
      for (let i = 0; i < 4; i++) {
        const z = -0.42 + i * 0.28;
        box(group, black, 0.09, 0.16, 0.2, half + 0.02, 0.24, z, false);
        box(group, steel, 0.12, 0.016, 0.24, half + 0.035, 0.152, z, false);
        // Short chute out of each exit: §5.4 distributes processed FUEL back
        // into the NEUTRAL ZONE through one of four exits.
        const chute = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.018, 0.2), dark);
        chute.position.set(half + 0.14, 0.13, z);
        chute.rotation.z = -0.3;
        group.add(chute);
        for (const dz of [-0.1, 0.1]) {
          box(group, allyMat, 0.26, 0.07, 0.014, half + 0.14, 0.16, z + dz, false);
        }
      }
      // Alliance panels from the exits up to the funnel, with panel seams.
      for (const sz of [-1, 1]) {
        box(group, allyMat, half * 2 - 0.02, bodyTop - 0.42, 0.04, 0, (bodyTop + 0.42) / 2, sz * half);
        for (let i = -3; i <= 3; i++) {
          box(group, allyDark, 0.016, bodyTop - 0.46, 0.05, i * 0.17, (bodyTop + 0.42) / 2, sz * half, false);
        }
      }
      for (const sx of [-1, 1]) {
        box(group, allyMat, 0.04, bodyTop - 0.42, half * 2 - 0.02, sx * half, (bodyTop + 0.42) / 2, 0);
        for (let i = -3; i <= 3; i++) {
          box(group, allyDark, 0.05, bodyTop - 0.46, 0.016, sx * half, (bodyTop + 0.42) / 2, i * 0.17, false);
        }
        // Capping rail along the top edge of the body.
        box(group, steel, 0.07, 0.05, half * 2 + 0.02, sx * half, bodyTop + 0.02, 0, false);
      }
      for (const sz of [-1, 1]) {
        box(group, steel, half * 2 + 0.02, 0.05, 0.07, 0, bodyTop + 0.02, sz * half, false);
      }

      // AprilTags with polycarbonate backing panels on every face.
      const ids = tagIds[hub.alliance];
      const faces: Array<[number, number, number, number]> = [
        [half + 0.028, 0, Math.PI / 2, 0],
        [0, half + 0.028, 0, 1],
        [-half - 0.028, 0, -Math.PI / 2, 2],
        [0, -half - 0.028, Math.PI, 3],
      ];
      for (const [tx, tz, rot, faceIndex] of faces) {
        const pair = ids[faceIndex];
        for (let i = 0; i < 2; i++) {
          const offset = i === 0 ? 0 : 0.3;
          const alongX = Math.abs(tx) < 0.01 ? offset : 0;
          const alongZ = Math.abs(tz) < 0.01 ? offset : 0;
          const backing = new THREE.Mesh(
            new THREE.PlaneGeometry(0.267, 0.267),
            material('#e9eef4', { roughness: 0.55, metalness: 0.05 }),
          );
          backing.position.set(tx + alongX, 1.124, tz + alongZ);
          backing.rotation.y = rot;
          group.add(backing);
          const tag = new THREE.Mesh(
            new THREE.PlaneGeometry(0.206, 0.206),
            new THREE.MeshBasicMaterial({ map: makeAprilTagTexture(pair[i]), toneMapped: false }),
          );
          const nx = Math.abs(tx) > 0.01 ? Math.sign(tx) : 0;
          const nz = Math.abs(tz) > 0.01 ? Math.sign(tz) : 0;
          tag.position.set(tx + alongX + nx * 0.004, 1.124, tz + alongZ + nz * 0.004);
          tag.rotation.y = rot;
          group.add(tag);
        }
      }

      // Hexagonal opening: 41.7 in across, its front edge 72 in up (§5.4). The
      // collar flares from the square body out to the rim, and its six panels
      // are clear polycarbonate on alliance-coloured ribs, so the HUB reads as
      // an open funnel instead of a closed drum.
      const funnelH = rimY - bodyTop;
      const rimRadius = 0.611;
      const throatRadius = 0.4;
      const funnel = new THREE.Mesh(
        new THREE.CylinderGeometry(rimRadius, throatRadius, funnelH, 6, 1, true),
        new THREE.MeshPhysicalMaterial({
          color: '#a9bccd',
          roughness: 0.22,
          metalness: 0.02,
          transparent: true,
          opacity: 0.22,
          side: THREE.DoubleSide,
          depthWrite: false,
          flatShading: true,
        }),
      );
      funnel.rotation.y = Math.PI / 6;
      funnel.position.y = bodyTop + funnelH / 2;
      group.add(funnel);
      // Six sloped ribs, one per hex edge, in the alliance colour. These are
      // the lines that make the opening legible from a low camera.
      const apothem = Math.cos(Math.PI / 6);
      for (let i = 0; i < 6; i++) {
        const angle = (i * Math.PI) / 3;
        beamBetween(
          group,
          allyMat,
          new THREE.Vector3(Math.cos(angle) * throatRadius * apothem, bodyTop, Math.sin(angle) * throatRadius * apothem),
          new THREE.Vector3(Math.cos(angle) * rimRadius * apothem, rimY, Math.sin(angle) * rimRadius * apothem),
          0.045,
        );
      }
      // Interior hopper: the dark tapered throat FUEL drops through.
      const hopper = new THREE.Mesh(
        new THREE.CylinderGeometry(throatRadius * 0.96, 0.17, 0.62, 6, 1, true),
        new THREE.MeshStandardMaterial({
          color: '#12161c',
          roughness: 0.88,
          metalness: 0.12,
          side: THREE.BackSide,
          flatShading: true,
        }),
      );
      hopper.rotation.y = Math.PI / 6;
      hopper.position.y = bodyTop - 0.31;
      group.add(hopper);
      const throat = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.18, 0.04, 18),
        new THREE.MeshBasicMaterial({ color: '#04060a' }),
      );
      throat.position.y = bodyTop - 0.6;
      group.add(throat);
      // Rim: a powder-coated hex frame with the DMX bars just below it. Each
      // bar gets its own material so the chase can travel around the rim.
      const rimMat = material(allianceColor, { roughness: 0.32, metalness: 0.4 });
      for (let i = 0; i < 6; i++) {
        const a0 = (i / 6) * Math.PI * 2 + Math.PI / 6;
        const a1 = ((i + 1) / 6) * Math.PI * 2 + Math.PI / 6;
        beamBetween(
          group,
          rimMat,
          new THREE.Vector3(Math.cos(a0) * rimRadius, rimY, Math.sin(a0) * rimRadius),
          new THREE.Vector3(Math.cos(a1) * rimRadius, rimY, Math.sin(a1) * rimRadius),
          0.055,
        );
        const barMat = new THREE.MeshStandardMaterial({
          color: allianceColor.clone(),
          emissive: allianceColor.clone(),
          emissiveIntensity: 1.3,
          roughness: 0.3,
          metalness: 0.2,
        });
        this.hubGlow[hub.alliance].push(barMat);
        beamBetween(
          group,
          barMat,
          new THREE.Vector3(Math.cos(a0) * rimRadius * 0.985, rimY - 0.055, Math.sin(a0) * rimRadius * 0.985),
          new THREE.Vector3(Math.cos(a1) * rimRadius * 0.985, rimY - 0.055, Math.sin(a1) * rimRadius * 0.985),
          0.028,
        );
      }
      // DMX bars along the four upper edges of the body, angled up the funnel.
      for (let i = 0; i < 4; i++) {
        const angle = (i * Math.PI) / 2 + Math.PI / 4;
        const bar = box(
          group,
          glowMat,
          half * 1.5,
          0.03,
          0.035,
          Math.cos(angle) * (half + 0.02),
          bodyTop + 0.055,
          Math.sin(angle) * (half + 0.02),
          false,
        );
        bar.rotation.y = -(angle + Math.PI / 2);
        bar.rotation.z = 0;
      }

      // Net backstop: §5.4 puts a net in the back of the HUB so FUEL launched
      // from most prohibited areas cannot drop into the opening. It is one
      // screen on the alliance side, not a cage wrapped round the structure.
      const netH = 0.66;
      const netW = 1.02;
      const netX = -half - 0.12;
      const netY = rimY - netH / 2 - 0.14;
      const net = new THREE.Mesh(new THREE.PlaneGeometry(netW, netH), netMat);
      net.position.set(netX, netY, 0);
      net.rotation.y = Math.PI / 2;
      group.add(net);
      for (const sz of [-1, 1]) {
        box(group, netFrame, 0.045, netH + 0.14, 0.045, netX, netY, sz * (netW / 2 + 0.01));
        // Rake back to the body corner so the screen is braced, not floating.
        beamBetween(
          group,
          netFrame,
          new THREE.Vector3(netX, netY - netH / 2, sz * (netW / 2 + 0.01)),
          new THREE.Vector3(-half + 0.04, bodyTop - 0.05, sz * (netW / 2 + 0.01)),
          0.035,
        );
      }
      box(group, netFrame, 0.045, 0.045, netW + 0.12, netX, netY + netH / 2, 0, false);
      // HUB sign on the field-facing face, beside the centred AprilTag.
      const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(0.38, 0.19),
        new THREE.MeshBasicMaterial({ map: makeHubSign(hub.alliance), toneMapped: false }),
      );
      sign.position.set(half + 0.026, 1.124, -0.3);
      sign.rotation.y = Math.PI / 2;
      group.add(sign);
    }
  }

  /**
   * The TOWER: a floor plate, two 72.1 in uprights and three pipe rungs at 27,
   * 45 and 63 in, powder-coated in the alliance colour (§5.8).
   */
  private addTowers(): void {
    for (const tower of this.field.towers) {
      const group = new THREE.Group();
      group.position.set(tower.x, 0, tower.y);
      group.rotation.y = tower.alliance === 'red' ? 0 : Math.PI;
      this.scene.add(group);
      const red = tower.alliance === 'red';
      const allyMat = material(red ? RED : BLUE, { roughness: 0.4, metalness: 0.42 });
      const steel = material('#ccd4dd', { metalness: 0.78, roughness: 0.3 });
      const dark = material('#1d232b', { metalness: 0.5, roughness: 0.45 });
      const panelMat = material(red ? '#7d0d1e' : '#06336f', { roughness: 0.52, metalness: 0.24 });

      // 39 x 45.18 in powder-coated base plate on hook fastener.
      box(group, dark, 0.991, 0.045, 1.147, 0, 0.022, 0);
      box(group, material('#3f4650', { roughness: 0.95 }), 0.86, 0.012, 1.0, 0, 0.05, 0, false);
      // Two 72.1 in box uprights, 32.25 in apart, each 1.5 in thick.
      for (const z of [-0.41, 0.41]) {
        box(group, allyMat, 0.038, 1.831, 0.089, -0.12, 0.045 + 1.831 / 2, z);
        box(group, dark, 0.06, 0.09, 0.12, -0.12, 0.09, z, false);
        beamBetween(
          group,
          steel,
          new THREE.Vector3(-0.14, 0.72, z),
          new THREE.Vector3(-0.46, 0.5, z),
          0.045,
        );
        beamBetween(
          group,
          steel,
          new THREE.Vector3(-0.14, 1.1, z),
          new THREE.Vector3(-0.46, 1.02, z),
          0.045,
        );
      }
      box(group, allyMat, 0.038, 0.05, 0.86, -0.12, 1.9, 0);
      box(group, dark, 0.06, 0.06, 0.9, -0.12, 1.93, 0, false);
      // Three 1.66 in pipe rungs at 27, 45 and 63 in, protruding 5.875 in.
      for (const y of [0.686, 1.143, 1.6]) {
        const rung = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.021, 1.156, 14), allyMat);
        rung.rotation.x = Math.PI / 2;
        rung.position.set(0.07, y, 0);
        rung.castShadow = true;
        group.add(rung);
        for (const z of [-0.61, 0.61]) {
          const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.03, 10), steel);
          cap.rotation.x = Math.PI / 2;
          cap.position.set(0.07, y, z);
          group.add(cap);
        }
        // Rung brackets onto the uprights.
        for (const z of [-0.41, 0.41]) box(group, steel, 0.08, 0.055, 0.05, 0.07, y, z, false);
      }
      // Tower wall behind the rungs, carrying the two AprilTags at 21.75 in.
      box(group, panelMat, 0.05, 1.28, 1.3, -0.47, 1.35, 0);
      box(group, dark, 0.075, 0.06, 1.34, -0.47, 2.02, 0, false);
      const tagIds = red ? [15, 16] : [31, 32];
      for (let i = 0; i < 2; i++) {
        const z = i === 0 ? 0 : 0.32;
        box(group, material('#e9eef4', { roughness: 0.55 }), 0.012, 0.267, 0.267, -0.44, 0.552, z, false);
        const tag = new THREE.Mesh(
          new THREE.PlaneGeometry(0.206, 0.206),
          new THREE.MeshBasicMaterial({ map: makeAprilTagTexture(tagIds[i]), toneMapped: false }),
        );
        tag.position.set(-0.432, 0.552, z);
        tag.rotation.y = Math.PI / 2;
        group.add(tag);
      }
    }
  }

  /**
   * OUTPOSTs at the end of each alliance wall: a 15° feed chute at 28 in, a
   * low robot-return opening, and the polycarbonate corral for the human player
   * (§5.9).
   */
  private addOutposts(): void {
    const { length: L } = this.field.size;
    const fuelTex = makeFuelTexture();
    const fuelMat = new THREE.MeshStandardMaterial({ map: fuelTex, roughness: 0.9, metalness: 0.02 });
    const ballGeo = new THREE.SphereGeometry(0.075, 12, 10);
    for (const outpost of this.field.outposts) {
      const red = outpost.alliance === 'red';
      const group = new THREE.Group();
      group.position.set(red ? -0.5 : L + 0.5, 0, outpost.y);
      group.rotation.y = red ? 0 : Math.PI;
      this.scene.add(group);
      const allyMat = material(red ? RED : BLUE, { roughness: 0.45 });
      const shell = material('#e3e8ed', { metalness: 0.18, roughness: 0.52 });
      const dark = material('#171d24', { metalness: 0.5, roughness: 0.42 });
      const rail = material('#8b939c', { metalness: 0.7, roughness: 0.32 });
      const glass = new THREE.MeshPhysicalMaterial({
        color: '#d6e7f7',
        transparent: true,
        opacity: 0.24,
        roughness: 0.05,
        side: THREE.DoubleSide,
        depthWrite: false,
      });

      // Corral: 35.8 in x 37.6 in with 8.13 in polycarbonate panels.
      box(group, dark, 0.95, 0.03, 1.0, -0.1, 0.015, 0);
      for (const z of [-0.49, 0.49]) box(group, glass, 0.92, 0.207, 0.02, -0.12, 0.13, z, false);
      box(group, glass, 0.02, 0.207, 0.98, -0.58, 0.13, 0, false);
      for (const z of [-0.5, 0.5]) box(group, rail, 0.03, 0.24, 0.03, 0.35, 0.12, z);

      // Cabinet, chute and robot-return opening.
      box(group, shell, 0.5, 0.9, 0.98, -0.28, 0.45, 0);
      box(group, allyMat, 0.54, 0.07, 1.02, -0.28, 0.935, 0);
      const chute = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.03, 0.82), dark);
      chute.position.set(0.06, 0.79, 0);
      chute.rotation.z = 0.26;
      group.add(chute);
      box(group, dark, 0.05, 0.23, 0.81, 0.02, 0.8, 0, false);
      box(group, allyMat, 0.04, 0.028, 0.88, 0.03, 0.925, 0, false);
      box(group, dark, 0.05, 0.16, 0.81, 0.02, 0.13, 0, false);
      const divider = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.16, 8), rail);
      divider.position.set(0.05, 0.13, 0);
      group.add(divider);

      // Sign and the two AprilTags at 21.75 in (§5.11).
      box(group, allyMat, 0.04, 0.28, 0.74, -0.28, 1.06, 0);
      const tex = makeTextTexture('OUTPOST', {
        width: 512,
        height: 160,
        background: red ? '#8d1125' : '#003d86',
        color: '#ffffff',
        font: '800 52px "Barlow Condensed", "Arial Narrow", sans-serif',
        sub: 'HUMAN PLAYER',
        border: true,
      });
      const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(0.7, 0.24),
        new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }),
      );
      sign.position.set(-0.255, 1.06, 0);
      sign.rotation.y = Math.PI / 2;
      group.add(sign);
      const tagIds = red ? [13, 14] : [29, 30];
      for (let i = 0; i < 2; i++) {
        const z = i === 0 ? 0.1 : 0.42;
        box(group, material('#e9eef4', { roughness: 0.55 }), 0.012, 0.267, 0.267, -0.036, 0.552, z, false);
        const tag = new THREE.Mesh(
          new THREE.PlaneGeometry(0.206, 0.206),
          new THREE.MeshBasicMaterial({ map: makeAprilTagTexture(tagIds[i]), toneMapped: false }),
        );
        tag.position.set(-0.028, 0.552, z);
        tag.rotation.y = Math.PI / 2;
        group.add(tag);
      }

      // FUEL in the 15° chute is the human player's stock (§6.3.4: 24 at
      // kickoff). Its count follows the live HP storage, so the chute visibly
      // drains as they feed and refills from the corral.
      const chuteFuel = new THREE.InstancedMesh(ballGeo, fuelMat, 24);
      chuteFuel.castShadow = false;
      const chuteDummy = new THREE.Object3D();
      for (let i = 0; i < 24; i++) {
        const layer = i < 12 ? 0 : 1;
        const k = i % 12;
        chuteDummy.position.set(
          0.05 + ((k % 4) - 1.5) * 0.11,
          0.82 + layer * 0.11,
          (Math.floor(k / 4) - 1) * 0.22,
        );
        chuteDummy.updateMatrix();
        chuteFuel.setMatrixAt(i, chuteDummy.matrix);
      }
      chuteFuel.count = 24;
      group.add(chuteFuel);
      this.chuteFuel[outpost.alliance] = chuteFuel;

      // A few FUEL in the corral, plus the human player standing behind it.
      for (let i = 0; i < 8; i++) {
        const ball = new THREE.Mesh(ballGeo, fuelMat);
        ball.position.set(-0.5 + (i % 3) * 0.16, 0.075 + (i >= 6 ? 0.12 : 0), -0.3 + (Math.floor(i / 3) % 2) * 0.34);
        group.add(ball);
      }
      const crew = new THREE.Group();
      crew.position.set(-1.0, 0, 0.74);
      group.add(crew);
      const shirt = material(red ? '#b8102b' : '#004a9e', { roughness: 0.75 });
      const trousers = material('#232a33', { roughness: 0.85 });
      const skin = material('#c99a76', { roughness: 0.7 });
      box(crew, trousers, 0.17, 0.78, 0.2, 0, 0.39, -0.11);
      box(crew, trousers, 0.17, 0.78, 0.2, 0, 0.39, 0.11);
      box(crew, shirt, 0.26, 0.56, 0.46, 0, 1.06, 0);
      for (const sz of [-1, 1]) {
        box(crew, shirt, 0.16, 0.46, 0.15, 0, 1.1, sz * 0.3);
        box(crew, skin, 0.12, 0.12, 0.13, 0.02, 0.83, sz * 0.3);
      }
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 12), skin);
      head.position.set(0, 1.5, 0);
      head.castShadow = true;
      crew.add(head);
      box(crew, material(red ? '#7d0d1e' : '#06336f', { roughness: 0.7 }), 0.26, 0.05, 0.26, 0, 1.6, 0);
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
    const frameMat = material('#b6bfc9', { metalness: 0.45, roughness: 0.4 });
    const dark = material('#1b212a', { metalness: 0.45, roughness: 0.45 });
    const deskMat = material('#f3f6f9', { roughness: 0.7, metalness: 0.08 });
    const redMat = material('#a8162c', { roughness: 0.5 });
    const blueMat = material('#0c4b9e', { roughness: 0.5 });
    const blackMat = material('#0c0f14', { roughness: 0.5, metalness: 0.3 });

    // Driver stations: 36.8 in diamond-plate bases under 42 in clear panels,
    // with the operator console shelf and team sign (§5.9.1). The TOWER sits
    // between stations 2 and 3.
    const plateTex = makeDiamondPlateTexture();
    plateTex.repeat.set(2, 2);
    const plateMat = new THREE.MeshStandardMaterial({ map: plateTex, roughness: 0.58, metalness: 0.55 });
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: '#cfe4f5',
      transparent: true,
      opacity: 0.16,
      roughness: 0.04,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    for (const alliance of ['red', 'blue'] as const) {
      const facing = alliance === 'red' ? 1 : -1;
      const baseX = alliance === 'red' ? -1.95 : L + 1.95;
      // Stations 1, 2 and 3 along the alliance wall, with the TOWER between
      // stations 2 and 3 and every booth inside the 317.7 in width.
      const stationZ =
        alliance === 'red' ? [2.0, 3.0, 5.85] : [W - 2.0, W - 3.0, W - 5.85];
      const allyMat = alliance === 'red' ? redMat : blueMat;
      const ledColor = alliance === 'red' ? '#ff4a5c' : '#4ea0ff';
      const teams = this.setup.robots
        .filter((robot) => robot.alliance === alliance)
        .sort((a, b) => a.index - b.index);
      for (let index = 0; index < stationZ.length; index++) {
        const station = new THREE.Group();
        station.position.set(baseX, 0, stationZ[index]);
        station.rotation.y = facing === 1 ? 0 : Math.PI;
        this.scene.add(station);
        const team = teams[index];

        // Base, sponsor panel, clear upper wall and top rail. The booth is
        // 36.8 in wide, the diamond-plate base the manual specifies (§5.9.1).
        box(station, dark, 1.4, 0.07, 0.94, 0, 0.035, 0);
        box(station, plateMat, 1.26, 0.86, 0.86, 0, 0.5, 0);
        box(station, allyMat, 0.06, 0.16, 0.9, 0.63, 0.87, 0, false);
        box(station, glassMat, 0.02, 1.06, 0.9, 0.63, 1.47, 0, false);
        for (const pz of [-0.45, 0.45]) box(station, frameMat, 0.05, 2.02, 0.05, 0.63, 1.01, pz, false);
        box(station, frameMat, 0.09, 0.05, 0.94, 0.63, 2.02, 0, false);
        // Operator console shelf and its screen, on the human side.
        box(station, deskMat, 1.2, 0.04, 0.28, -0.24, 0.95, 0, false);
        box(station, dark, 0.03, 0.26, 0.4, -0.31, 1.12, 0, false);

        // Robot status LED stack (§5.9.1): two alliance LEDs above the amber
        // A-stop/E-stop light. Each has its own material so it can blink.
        let ledPhase = 0;
        for (const lz of [-0.34, 0.34]) {
          const mat = new THREE.MeshBasicMaterial({ color: ledColor, toneMapped: false });
          const led = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), mat);
          led.position.set(0.69, 1.72, lz);
          station.add(led);
          this.stationLeds.push({ mat, alliance, robotId: team?.id, mode: 'off', phase: ledPhase++ });
        }
        const amberMat = new THREE.MeshBasicMaterial({ color: '#ffb12e', toneMapped: false });
        const amber = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), amberMat);
        amber.position.set(0.69, 1.72, 0);
        station.add(amber);
        this.stationAmber.push(amberMat);

        // DRIVER STATION 2 carries the match timer, facing the field (§5.9.1).
        if (index === 1) {
          const canvas = document.createElement('canvas');
          canvas.width = 512;
          canvas.height = 128;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            const texture = new THREE.CanvasTexture(canvas);
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.anisotropy = 4;
            this.stationTimers[alliance] = { ctx, texture, second: -1 };
            box(station, dark, 0.02, 0.16, 0.56, 0.645, 1.78, 0, false);
            const board = new THREE.Mesh(
              new THREE.PlaneGeometry(0.5, 0.125),
              new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }),
            );
            board.position.set(0.658, 1.78, 0);
            board.rotation.y = Math.PI / 2;
            station.add(board);
          }
        }

        // Team sign at the top of the station, number in alliance colour.
        box(station, allyMat, 0.06, 0.42, 0.88, 0.6, 2.24, 0);
        const boardTex = makeTextTexture(
          team ? `#${team.teamNumber}` : `${alliance.toUpperCase()} ${index + 1}`,
          {
            width: 512,
            height: 160,
            background: alliance === 'red' ? '#a30f27' : '#00479a',
            color: '#ffffff',
            sub: team ? team.teamName.toUpperCase() : 'DRIVER STATION',
            border: true,
            accent: '#ffd23f',
          },
        );
        const board = new THREE.Mesh(
          new THREE.PlaneGeometry(1.24, 0.36),
          new THREE.MeshBasicMaterial({ map: boardTex, toneMapped: false }),
        );
        board.position.set(0.64, 2.24, 0);
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

  /**
   * FIELD STAFF. Volunteers are part of how a real field looks: the head
   * referee wears yellow and stands between the field and the scoring table
   * (§5.13), the FTA carries a tablet, and reset crew work the sidelines.
   */
  private addFieldStaff(): void {
    const { length: L, width: W } = this.field.size;
    const build = (
      x: number,
      z: number,
      facing: number,
      shirt: string,
      tablet = false,
      vest = false,
    ) => {
      const group = new THREE.Group();
      group.position.set(x, 0, z);
      group.rotation.y = facing;
      this.scene.add(group);
      const trousers = material('#232a33', { roughness: 0.85 });
      const shirtMat = material(shirt, { roughness: 0.78 });
      const skin = material('#c99a76', { roughness: 0.72 });
      for (const dz of [-0.11, 0.11]) box(group, trousers, 0.16, 0.78, 0.18, 0, 0.39, dz);
      box(group, shirtMat, 0.24, 0.54, 0.44, 0, 1.05, 0);
      if (vest) box(group, material('#d8e34a', { roughness: 0.82 }), 0.27, 0.28, 0.47, 0, 1.11, 0, false);
      for (const dz of [-0.29, 0.29]) {
        box(group, shirtMat, 0.15, 0.44, 0.14, 0, 1.08, dz);
        box(group, skin, 0.11, 0.11, 0.12, 0.01, 0.82, dz);
      }
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.115, 14, 12), skin);
      head.position.set(0, 1.48, 0);
      head.castShadow = true;
      group.add(head);
      // Cap sits on top of the head rather than swallowing it.
      box(group, material('#0f141a', { roughness: 0.75 }), 0.19, 0.04, 0.19, 0, 1.555, 0);
      // Lanyard and badge: every field volunteer has one.
      box(group, material('#ffd23f', { roughness: 0.6 }), 0.02, 0.2, 0.02, 0.13, 1.2, -0.08, false);
      if (tablet) box(group, material('#1a222b', { roughness: 0.5, metalness: 0.4 }), 0.03, 0.22, 0.3, 0.2, 1.02, -0.12);
    };
    // Head referee in yellow between the field and the scoring table.
    build(L / 2 - 1.5, -1.35, Math.PI, '#f2c11c');
    // FTA with a tablet, plus the reset crew on both sidelines.
    build(L / 2 + 3.0, -1.3, Math.PI * 0.9, '#1c3f70', true);
    build(2.4, -1.3, Math.PI, '#20262f', false, true);
    build(L - 2.7, W + 1.32, 0, '#20262f', false, true);
    build(L / 2 + 0.5, W + 1.28, 0, '#1c3f70');
  }

  /**
   * Stands on both long sides: stepped tiers, a seated crowd, a ribbon board,
   * the event banner wall and a live video board. One build is mirrored across
   * the field, so whichever sideline the camera sits on the backdrop works.
   */
  private addGrandstand(): void {
    // A single canvas drives both boards: they show the same match, exactly
    // like a pair of venue screens.
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 320;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 8;
      this.boardCanvas = canvas;
      this.boardCtx = ctx;
      this.boardTexture = texture;
      this.drawBoard(null);
    }
    for (const side of [-1, 1] as const) {
      const stand = new THREE.Group();
      if (side > 0) {
        stand.rotation.y = Math.PI;
        stand.position.set(this.field.size.length, 0, this.field.size.width);
      }
      this.scene.add(stand);
      this.buildStand(stand);
    }
  }

  private buildStand(parent: THREE.Group): void {
    const { length: L } = this.field.size;
    const cx = L / 2;
    const span = L + 7.2;
    const frontZ = -6.2;
    const tiers = 4;
    const tierDepth = 0.92;
    const tierRise = 0.48;
    const wallZ = frontZ - tiers * tierDepth - 0.24;

    const stepMat = material('#464f5b', { metalness: 0.16, roughness: 0.66 });
    const fasciaMat = material('#1b222b', { metalness: 0.35, roughness: 0.5 });
    const wallMat = material('#121820', { metalness: 0.2, roughness: 0.7 });
    const railMat = material('#d8dfe7', { metalness: 0.45, roughness: 0.35 });

    for (let tier = 0; tier < tiers; tier++) {
      const height = tierRise * (tier + 1);
      const z = frontZ - tier * tierDepth - tierDepth / 2;
      box(parent, stepMat, span, height, tierDepth, cx, height / 2, z);
    }
    box(parent, fasciaMat, span, 0.86, 0.16, cx, 0.43, frontZ + 0.1);
    box(
      parent,
      railMat,
      span,
      0.05,
      0.05,
      cx,
      tierRise * tiers + 0.66,
      frontZ - (tiers - 1) * tierDepth - tierDepth + 0.05,
      false,
    );

    // Seated crowd, instanced so a packed stand stays cheap to draw. Bodies and
    // heads are separate instances, which reads far more like people than a
    // block per seat.
    const seats: Array<{ x: number; y: number; z: number; turn: number }> = [];
    for (let tier = 0; tier < tiers; tier++) {
      const y = tierRise * (tier + 1) + 0.31;
      const z = frontZ - tier * tierDepth - tierDepth / 2 + 0.02;
      for (let x = -span / 2 + 0.55; x < span / 2 - 0.45; x += 0.66) {
        if (Math.random() < 0.22) continue;
        seats.push({
          x: cx + x + (Math.random() - 0.5) * 0.16,
          y,
          z: z + (Math.random() - 0.5) * 0.14,
          turn: (Math.random() - 0.5) * 0.5,
        });
      }
    }
    const bodyMat = material('#8d939c', { roughness: 0.86, metalness: 0.02 });
    const crowd = new THREE.InstancedMesh(new THREE.BoxGeometry(0.34, 0.6, 0.32), bodyMat, seats.length);
    const heads = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.105, 8, 6),
      material('#9c8577', { roughness: 0.82, metalness: 0.02 }),
      seats.length,
    );
    const dummy = new THREE.Object3D();
    // Muted crowd palette: event photos read as a dark mass with a scatter of
    // team colours, not a wall of primaries.
    const palette = ['#8d2333', '#1f4a7d', '#b9c1c9', '#2b323b', '#b8963f', '#525b66', '#7a4433', '#3d5b4a', '#232a33', '#6a717b'];
    const color = new THREE.Color();
    seats.forEach((seat, index) => {
      dummy.position.set(seat.x, seat.y, seat.z);
      dummy.rotation.set(0, seat.turn, 0);
      dummy.updateMatrix();
      crowd.setMatrixAt(index, dummy.matrix);
      crowd.setColorAt(index, color.set(palette[Math.floor(Math.random() * palette.length)]));
      dummy.position.set(seat.x, seat.y + 0.36, seat.z);
      dummy.rotation.set(0, seat.turn, 0);
      dummy.updateMatrix();
      heads.setMatrixAt(index, dummy.matrix);
    });
    crowd.castShadow = false;
    crowd.receiveShadow = false;
    heads.castShadow = false;
    parent.add(crowd);
    parent.add(heads);

    // Back wall carrying the event banner.
    box(parent, wallMat, span + 1.8, 3.5, 0.3, cx, 1.75, wallZ);
    const bannerTex = makeTextTexture('REBUILT 2026', {
      width: 1024,
      height: 256,
      background: '#0d1219',
      color: '#f2f6fb',
      sub: 'WORLD CHAMPIONSHIP',
      accent: '#ffd23f',
      border: true,
    });
    const banner = new THREE.Mesh(
      new THREE.PlaneGeometry(span + 0.6, 1.7),
      new THREE.MeshBasicMaterial({ map: bannerTex, toneMapped: false }),
    );
    banner.position.set(cx, 2.4, wallZ + 0.16);
    parent.add(banner);

    // Ribbon board along the front of the stand.
    const ribbonZ = frontZ + 0.19;
    const ribbon = new THREE.Mesh(
      new THREE.PlaneGeometry(span, 0.46),
      new THREE.MeshBasicMaterial({ color: '#08111c', toneMapped: false }),
    );
    ribbon.position.set(cx, 0.5, ribbonZ);
    parent.add(ribbon);
    const ribbonCool = new THREE.MeshBasicMaterial({ color: '#4ec3ff', toneMapped: false });
    const ribbonWarm = new THREE.MeshBasicMaterial({ color: '#ffcf5a', toneMapped: false });
    let ribbonIndex = 0;
    for (let x = -span / 2 + 0.6; x < span / 2 - 0.6; x += 1.55) {
      box(parent, ribbonIndex++ % 5 === 0 ? ribbonWarm : ribbonCool, 1.05, 0.13, 0.03, cx + x, 0.5, ribbonZ + 0.02, false);
    }

    // Hanging video board: the bright anchor above each stand, showing the live
    // score and clock the way an event screen does.
    const boardW = Math.min(span * 0.42, 10.4);
    const boardH = boardW * 0.3125;
    const boardY = 5.5;
    const boardZ = wallZ - 0.72;
    const rigMat = material('#151c24', { metalness: 0.55, roughness: 0.38 });
    for (const dx of [-boardW * 0.36, boardW * 0.36]) {
      const postH = boardY - boardH / 2 + 0.2;
      box(parent, rigMat, 0.16, postH, 0.16, cx + dx, postH / 2, boardZ);
    }
    box(parent, rigMat, boardW + 0.6, boardH + 0.6, 0.44, cx, boardY, boardZ);
    if (this.boardTexture) {
      const boardFace = new THREE.Mesh(
        new THREE.PlaneGeometry(boardW, boardH),
        new THREE.MeshBasicMaterial({ map: this.boardTexture, toneMapped: false }),
      );
      boardFace.position.set(cx, boardY, boardZ + 0.23);
      parent.add(boardFace);
    }
    box(
      parent,
      new THREE.MeshBasicMaterial({ color: '#8fd8ff', toneMapped: false }),
      boardW + 0.5,
      0.06,
      0.06,
      cx,
      boardY - boardH / 2 - 0.32,
      boardZ + 0.24,
      false,
    );
  }

  /**
   * Live arena screen: alliance scores, the match clock, the current period and
   * the two HUB states. Redrawn only when something on it actually changes.
   */
  private drawBoard(snapshot: MatchSnapshot | null): void {
    const ctx = this.boardCtx;
    if (!ctx) return;
    const width = 1024;
    const height = 320;
    const red = snapshot?.scores.red;
    const blue = snapshot?.scores.blue;
    const remaining = Math.max(0, Math.ceil(snapshot?.timeRemaining ?? 0));
    const clock = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`;
    const phase = (snapshot?.phase ?? 'lobby').toUpperCase();

    ctx.fillStyle = '#05090f';
    ctx.fillRect(0, 0, width, height);
    // Alliance blocks, kept to the outer third so they frame the clock.
    const redGradient = ctx.createLinearGradient(0, 0, 400, 0);
    redGradient.addColorStop(0, '#8c0d20');
    redGradient.addColorStop(1, '#34060e');
    ctx.fillStyle = redGradient;
    ctx.fillRect(0, 0, 380, height);
    const blueGradient = ctx.createLinearGradient(644, 0, 1024, 0);
    blueGradient.addColorStop(0, '#04234f');
    blueGradient.addColorStop(1, '#0b4f9c');
    ctx.fillStyle = blueGradient;
    ctx.fillRect(644, 0, 380, height);
    ctx.fillStyle = '#0a121c';
    ctx.fillRect(380, 0, 264, height);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#9fb0c2';
    ctx.font = '600 20px "Inter", system-ui, sans-serif';
    ctx.fillText('REBUILT 2026  ·  WORLD CHAMPIONSHIP', width / 2, 24);

    // Scores.
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 132px "Barlow Condensed", "Arial Narrow", sans-serif';
    ctx.fillText(String(red?.total ?? 0), 190, 150);
    ctx.fillText(String(blue?.total ?? 0), 834, 150);
    ctx.fillStyle = 'rgba(255,255,255,.82)';
    ctx.font = '700 26px "Barlow Condensed", "Arial Narrow", sans-serif';
    ctx.fillText('RED  ALLIANCE', 190, 52);
    ctx.fillText('BLUE  ALLIANCE', 834, 52);

    // Clock and period.
    ctx.fillStyle = '#f4f9ff';
    ctx.font = '800 84px "Barlow Condensed", "Arial Narrow", sans-serif';
    ctx.fillText(clock, 512, 132);
    ctx.fillStyle = '#ffd23f';
    ctx.font = '700 30px "Barlow Condensed", "Arial Narrow", sans-serif';
    ctx.fillText(phase, 512, 196);
    // HUB status pips.
    const pip = (x: number, active: boolean, label: string) => {
      ctx.fillStyle = active ? '#6ee7a0' : '#333d49';
      ctx.beginPath();
      ctx.arc(x, 246, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = active ? '#c9f5d9' : '#5a6673';
      ctx.font = '600 21px "Inter", system-ui, sans-serif';
      ctx.fillText(label, x, 280);
    };
    pip(286, snapshot?.hubActive.red ?? true, 'HUB');
    pip(738, snapshot?.hubActive.blue ?? true, 'HUB');

    // Team numbers along the bottom of each block.
    const teams = (alliance: Alliance) =>
      this.setup.robots
        .filter((robot) => robot.alliance === alliance)
        .sort((a, b) => a.index - b.index)
        .map((robot) => `#${robot.teamNumber}`)
        .join('   ');
    ctx.fillStyle = 'rgba(255,255,255,.74)';
    ctx.font = '600 24px "Inter", system-ui, sans-serif';
    ctx.fillText(teams('red'), 190, 286);
    ctx.fillText(teams('blue'), 834, 286);

    // RP progress along the very bottom.
    ctx.fillStyle = 'rgba(255,255,255,.5)';
    ctx.font = '600 18px "Inter", system-ui, sans-serif';
    ctx.fillText(`${red?.rp ?? 0} RP`, 190, 306);
    ctx.fillText(`${blue?.rp ?? 0} RP`, 834, 306);
    if (this.boardTexture) this.boardTexture.needsUpdate = true;
  }

  /**
   * Driver-station clock for each alliance, and the LED stack semantics from
   * §5.9.1: solid when the robot is connected and enabled, blinking when it is
   * not, off when the field is not enabling it.
   */
  private drawStationTimers(snapshot: MatchSnapshot): void {
    const remaining = Math.max(0, Math.ceil(snapshot.timeRemaining));
    for (const alliance of ['red', 'blue'] as const) {
      const entry = this.stationTimers[alliance];
      if (!entry || entry.second === remaining) continue;
      entry.second = remaining;
      const { ctx, texture } = entry;
      const width = 512;
      const height = 128;
      ctx.fillStyle = '#04080d';
      ctx.fillRect(0, 0, width, height);
      ctx.strokeStyle = alliance === 'red' ? '#ff3b4e' : '#3f8bff';
      ctx.lineWidth = 6;
      ctx.strokeRect(3, 3, width - 6, height - 6);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      ctx.font = '800 82px "Barlow Condensed", "Arial Narrow", sans-serif';
      ctx.fillText(
        `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`,
        width / 2,
        height / 2 + 4,
      );
      texture.needsUpdate = true;
    }
    for (const led of this.stationLeds) {
      const robot = led.robotId ? snapshot.robots.find((entry) => entry.id === led.robotId) : undefined;
      if (!robot) led.mode = 'off';
      else if (robot.disconnected) led.mode = 'blink';
      else if (robot.disabled || robot.disqualified) led.mode = 'off';
      else led.mode = snapshot.phase === 'countdown' ? 'off' : 'solid';
    }
    const finished = snapshot.status === 'finished';
    for (const amber of this.stationAmber) {
      amber.color.set(finished ? '#2a2110' : '#ffb12e');
    }
  }

  /**
   * Stadium light towers around the venue. They give the broadcast shots depth
   * and a set of bright emissive heads for the bloom pass to work on.
   */
  private addVenueRig(): void {
    const { length: L, width: W } = this.field.size;
    const steel = material('#3d4753', { metalness: 0.7, roughness: 0.36 });
    const lamp = new THREE.MeshBasicMaterial({ color: '#fff4dd', toneMapped: false });
    const towers: Array<[number, number]> = [
      [-7, -8],
      [L + 7, -8],
      [-7, W + 8],
      [L + 7, W + 8],
    ];
    for (const [x, z] of towers) {
      const height = 13;
      for (const [dx, dz] of [
        [-0.33, -0.33],
        [0.33, -0.33],
        [-0.33, 0.33],
        [0.33, 0.33],
      ] as const) {
        box(this.scene, steel, 0.09, height, 0.09, x + dx, height / 2, z + dz, false);
      }
      for (let y = 1.4; y < height; y += 1.7) {
        box(this.scene, steel, 0.76, 0.05, 0.05, x, y, z - 0.33, false);
        box(this.scene, steel, 0.76, 0.05, 0.05, x, y, z + 0.33, false);
        box(this.scene, steel, 0.05, 0.05, 0.76, x - 0.33, y, z, false);
      }
      const head = new THREE.Group();
      head.position.set(x, height + 0.15, z);
      this.scene.add(head);
      head.lookAt(L / 2, 0, W / 2);
      box(head, steel, 2.4, 0.2, 1.15, 0, 0, 0, false);
      for (let index = -1; index <= 1; index++) {
        box(head, lamp, 0.6, 0.07, 0.95, index * 0.76, -0.13, 0, false);
      }
    }
  }

  /**
   * Overhead lighting truss. Real fields are lit from a rig above the carpet,
   * which is what gives a broadcast shot its bright pools and dark edges; the
   * four corner towers alone read as a sports ground rather than an arena.
   */
  private addOverheadRig(): void {
    const { length: L, width: W } = this.field.size;
    const steel = material('#2c3540', { metalness: 0.7, roughness: 0.42 });
    const chord = material('#3a4550', { metalness: 0.62, roughness: 0.44 });
    const trussY = 6.4;
    // The rig runs around the field rather than across it. The broadcast, orbit
    // and top cameras all sit above the carpet, so a truss over the playing
    // surface would cut straight through every one of those shots.
    const offset = 4.6;
    // The rig is its own group on layer 1: the driver camera sits under it and
    // should see the truss overhead, while the wide cameras are positioned
    // close to it and would otherwise have beams across the field.
    const rig = new THREE.Group();
    this.scene.add(rig);

    const buildTruss = (from: THREE.Vector3, to: THREE.Vector3) => {
      const direction = new THREE.Vector3().subVectors(to, from);
      const length = direction.length();
      const group = new THREE.Group();
      group.position.copy(from);
      group.rotation.y = -Math.atan2(direction.z, direction.x);
      rig.add(group);
      // Four chords in a 0.55 m square, the profile every box truss has.
      for (const dy of [-0.27, 0.27]) {
        for (const dz of [-0.24, 0.24]) {
          box(group, chord, length, 0.065, 0.065, length / 2, dy, dz, false);
        }
      }
      const bays = Math.max(2, Math.round(length / 1.25));
      for (let i = 0; i <= bays; i++) {
        const x = (i / bays) * length;
        for (const dz of [-0.24, 0.24]) box(group, steel, 0.045, 0.55, 0.045, x, 0, dz, false);
        if (i === bays) continue;
        const x2 = ((i + 1) / bays) * length;
        for (const dz of [-0.24, 0.24]) {
          beamBetween(
            group,
            steel,
            new THREE.Vector3(x, i % 2 === 0 ? -0.27 : 0.27, dz),
            new THREE.Vector3(x2, i % 2 === 0 ? 0.27 : -0.27, dz),
            0.032,
          );
        }
      }
    };

    for (const z of [-offset, W + offset]) {
      buildTruss(new THREE.Vector3(-offset, trussY, z), new THREE.Vector3(L + offset, trussY, z));
    }
    for (const x of [-offset, L + offset]) {
      buildTruss(new THREE.Vector3(x, trussY, -offset), new THREE.Vector3(x, trussY, W + offset));
    }

    // Fixtures hang off the inner face of the perimeter truss and throw across
    // the carpet, so every pool of light has a visible source and a visible
    // beam. Like the instruments at a real event, they are angled inwards.
    const canMat = material('#1a212a', { metalness: 0.55, roughness: 0.4 });
    const lensMat = new THREE.MeshBasicMaterial({ color: '#fff6e2', toneMapped: false });
    const shaftMat = new THREE.MeshBasicMaterial({
      color: '#cfe2ff',
      transparent: true,
      opacity: 0.02,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
      toneMapped: false,
    });
    const addFixture = (from: THREE.Vector3, to: THREE.Vector3) => {
      const direction = new THREE.Vector3().subVectors(to, from).normalize();
      const distance = from.distanceTo(to);
      const group = new THREE.Group();
      group.position.copy(from);
      rig.add(group);
      // Drop tube onto the truss chord, the yoke, then the can and its lens.
      box(group, canMat, 0.05, 0.46, 0.05, 0, 0.24, 0, false);
      box(group, canMat, 0.42, 0.05, 0.05, 0, -0.02, 0, false);
      const can = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.135, 0.4, 16, 1, true), canMat);
      can.position.copy(direction).multiplyScalar(0.34);
      can.quaternion.setFromUnitVectors(UP, direction);
      group.add(can);
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.13, 16), lensMat);
      lens.position.copy(direction).multiplyScalar(0.55);
      lens.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction);
      group.add(lens);
      // A cone of light, narrow at the lens and wide where it meets the carpet.
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 0.2, distance, 20, 1, true), shaftMat);
      shaft.position.copy(from).addScaledVector(direction, distance / 2);
      shaft.quaternion.setFromUnitVectors(UP, direction);
      rig.add(shaft);
      // Real pool, no shadow map: the key light already casts the shadows.
      const spot = new THREE.SpotLight(0xfff2dc, 64, 28, 0.46, 0.72, 1.7);
      spot.position.copy(from).addScaledVector(direction, 0.5);
      spot.target.position.copy(to);
      this.scene.add(spot);
      this.scene.add(spot.target);
    };
    // Six pools: four across the carpet, one on each HUB.
    for (const x of [L * 0.3, L * 0.7]) {
      addFixture(new THREE.Vector3(x, trussY - 0.5, -offset), new THREE.Vector3(x, 0, W * 0.4));
      addFixture(new THREE.Vector3(x, trussY - 0.5, W + offset), new THREE.Vector3(x, 0, W * 0.6));
    }
    for (const [x, z, targetX] of [
      [-offset, W / 2, 4.03],
      [L + offset, W / 2, L - 4.03],
    ] as const) {
      addFixture(new THREE.Vector3(x, trussY - 0.5, z), new THREE.Vector3(targetX, 0, z));
    }

    // Hanging event banners on both long sides, the way a venue dresses the rig
    // above the field. Both sides carry them so the backdrop works from either
    // camera position.
    for (const side of [-1, 1] as const) {
      const z = side < 0 ? -offset : W + offset;
      for (const [index, x] of [L * 0.34, L * 0.66].entries()) {
        const bannerTex = makeTextTexture(index === 0 ? 'REBUILT' : 'FIRST', {
          width: 512,
          height: 1024,
          background: '#0c1420',
          color: '#f2f7fd',
          sub: index === 0 ? '2026' : 'ROBOTICS',
          accent: index === 0 ? '#ffd23f' : '#4ec3ff',
          border: true,
        });
        const banner = new THREE.Mesh(
          new THREE.PlaneGeometry(1.15, 2.3),
          new THREE.MeshBasicMaterial({ map: bannerTex, toneMapped: false }),
        );
        banner.position.set(x, 4.95, z + side * 0.06);
        banner.rotation.y = side < 0 ? 0 : Math.PI;
        rig.add(banner);
        box(rig, steel, 1.3, 0.05, 0.05, x, 6.1, z, false);
      }
    }
    rig.traverse((object) => object.layers.set(1));
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
        turretYaw: 0,
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
    sprite.scale.set(0.82, 0.205, 1);
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
    this.drawStationTimers(snapshot);
    // The venue screens only need repainting when something on them changes.
    const boardKey = `${Math.ceil(snapshot.timeRemaining)}|${snapshot.scores.red.total}|${snapshot.scores.blue.total}|${snapshot.phase}|${snapshot.hubActive.red}|${snapshot.hubActive.blue}`;
    if (boardKey !== this.boardKey) {
      this.boardKey = boardKey;
      this.drawBoard(snapshot);
    }
    for (const alliance of ['red', 'blue'] as const) {
      const active = snapshot.hubActive[alliance];
      if (this.hubActiveState[alliance] !== active) {
        this.hubActiveState[alliance] = active;
        this.hubChangeAt[alliance] = this.elapsed;
      }
      // The chute holds the human player's stock: 24 at kickoff, fewer after
      // every feed, refilled from the corral.
      const chute = this.chuteFuel[alliance];
      if (chute) {
        const stock = snapshot.humans.find((human) => human.alliance === alliance)?.storage ?? 0;
        chute.count = Math.max(0, Math.min(24, Math.round(stock)));
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
    this.composer?.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.fitCamera.aspect = width / height;
    this.fitCamera.updateProjectionMatrix();
  }

  /**
   * Broadcast azimuth for the current window shape. Wide screens look almost
   * straight down the sideline so the long axis spans the width; taller screens
   * pull round to a corner so the field still reads big.
   */
  private broadcastAzimuth(): number {
    const stops: Array<[number, number]> = [
      [0.56, 6],
      [0.75, 18],
      [1.0, 52],
      [1.33, 60],
      [1.78, 76],
      [2.4, 84],
    ];
    const aspect = Math.min(Math.max(this.camera.aspect, stops[0][0]), stops[stops.length - 1][0]);
    let degrees = stops[stops.length - 1][1];
    for (let index = 1; index < stops.length; index++) {
      const [aspect0, deg0] = stops[index - 1];
      const [aspect1, deg1] = stops[index];
      if (aspect <= aspect1) {
        const t = (aspect - aspect0) / (aspect1 - aspect0);
        degrees = deg0 + (deg1 - deg0) * t;
        break;
      }
    }
    return (degrees * Math.PI) / 180;
  }

  /**
   * Distance at which a set of world points exactly fills `fill` of the
   * viewport. Projecting the corners and rescaling the distance keeps the
   * arena as large as the current window allows, on any aspect ratio.
   */
  private fitDistance(
    look: THREE.Vector3,
    direction: THREE.Vector3,
    points: THREE.Vector3[],
    fill: number,
    fov: number,
  ): number {
    const camera = this.fitCamera;
    camera.fov = fov;
    camera.aspect = this.camera.aspect;
    camera.updateProjectionMatrix();
    let distance = Math.max(this.field.size.length, this.field.size.width) * 1.15;
    for (let pass = 0; pass < 5; pass++) {
      camera.position.copy(look).addScaledVector(direction, distance);
      camera.lookAt(look);
      camera.updateMatrixWorld();
      let worst = 0;
      for (const point of points) {
        this.projected.copy(point).project(camera);
        worst = Math.max(worst, Math.abs(this.projected.x), Math.abs(this.projected.y));
      }
      if (!Number.isFinite(worst) || worst < 0.001) break;
      distance *= worst / fill;
    }
    return Math.min(distance, 90);
  }

  /** Tall structures the driver camera has to see over, as carpet footprints. */
  private chaseBlockers(): Array<{ minX: number; maxX: number; minZ: number; maxZ: number; top: number }> {
    // The field is fixed for the life of the scene, so this footprint list is
    // built once instead of on every driver-camera frame.
    if (this.chaseBlockerCache) return this.chaseBlockerCache;
    const blockers: Array<{ minX: number; maxX: number; minZ: number; maxZ: number; top: number }> = [];
    const hubTop = REBUILT_2026.hub.rimHeight + 0.18;
    for (const hub of this.field.hubs) {
      const half = Math.max(hub.width, hub.depth) / 2 + 0.12;
      blockers.push({ minX: hub.x - half, maxX: hub.x + half, minZ: hub.y - half, maxZ: hub.y + half, top: hubTop });
    }
    // The TOWER's 72 in uprights and its wall.
    for (const tower of this.field.towers) {
      blockers.push({
        minX: tower.x - tower.radius - 0.1,
        maxX: tower.x + tower.radius + 0.1,
        minZ: tower.y - tower.radius - 0.1,
        maxZ: tower.y + tower.radius + 0.1,
        top: 2.05,
      });
    }
    this.chaseBlockerCache = blockers;
    return blockers;
  }

  /**
   * Lift the chase camera until the line from the lens to its look point clears
   * every HUB and TOWER in the way. Without this the driver gets a screenful of
   * backboard the moment their robot drives past one.
   */
  private clearChase(eye: THREE.Vector3, aim: THREE.Vector3): void {
    const blockers = this.chaseBlockers();
    const dx = aim.x - eye.x;
    const dz = aim.z - eye.z;
    for (let pass = 0; pass < 3; pass++) {
      let lift = 0;
      for (const blocker of blockers) {
        // Slab test for the stretch of the eye-to-aim segment inside the footprint.
        let tMin = 0;
        let tMax = 1;
        let miss = false;
        for (const [origin, dir, min, max] of [
          [eye.x, dx, blocker.minX, blocker.maxX],
          [eye.z, dz, blocker.minZ, blocker.maxZ],
        ] as Array<[number, number, number, number]>) {
          if (Math.abs(dir) < 1e-6) {
            if (origin < min || origin > max) miss = true;
            continue;
          }
          const t1 = (min - origin) / dir;
          const t2 = (max - origin) / dir;
          tMin = Math.max(tMin, Math.min(t1, t2));
          tMax = Math.min(tMax, Math.max(t1, t2));
        }
        if (miss || tMin > tMax || tMax < 0 || tMin > 1) continue;
        const t = Math.min(0.96, Math.max(0.02, tMin));
        const height = eye.y + (aim.y - eye.y) * t;
        const need = blocker.top + 0.3;
        if (height < need) lift = Math.max(lift, (need - height) / (1 - t));
      }
      if (lift < 0.02) break;
      eye.y += lift;
    }
    // Even after the lift, never leave the lens inside a HUB or the TOWER.
    for (const blocker of blockers) {
      const inside =
        eye.x > blocker.minX && eye.x < blocker.maxX && eye.z > blocker.minZ && eye.z < blocker.maxZ;
      if (inside && eye.y < blocker.top + 0.1) eye.y = blocker.top + 0.1;
    }
  }

  private updateCamera(dt: number, immediate = false): void {
    // Reused scratch vectors: this runs every frame, so it should not hand the
    // garbage collector a handful of Vector3s sixty times a second.
    const target = this.tmpTarget;
    const look = this.tmpLook;
    const direction = this.tmpDirection;
    const field = this.field.size;
    const mode = this.cameraMode === 'driver' && !this.focusRobotId ? 'broadcast' : this.cameraMode;
    const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
    // A narrower lens than a first-person game: it pushes the camera back so
    // the arena reads with broadcast perspective instead of wide-angle bend.
    let desiredFov = 38;
    let chase = false;
    if (mode === 'driver' && this.focusRobotId) {
      const robot = this.robots.get(this.focusRobotId);
      if (robot) {
        const pos = robot.visual.group.position;
        // Use the authoritative heading so the chase camera does not inherit
        // the extra smoothing already applied to the robot mesh.
        const heading = robot.target.heading;
        const forward = this.tmpForward.set(Math.cos(heading), 0, Math.sin(heading));
        // Just over the robot's own height and three metres back: close enough
        // that the machine you are driving fills the lower third of the frame,
        // low enough that it still reads as a driver's view instead of a crane
        // shot.
        target.copy(pos).addScaledVector(forward, -3.2).add(this.tmpOffset.set(0, 1.55, 0));
        // A little outside the guardrails is fine and keeps the shot from
        // jumping when a robot backs into a corner.
        target.x = clamp(target.x, -2.2, field.length + 2.2);
        target.z = clamp(target.z, -2.2, field.width + 2.2);
        look.copy(pos).addScaledVector(forward, 0.7).add(this.tmpOffset.set(0, 0.52, 0));
        // HUBs and the TOWER are tall enough to sit between lens and robot.
        this.clearChase(target, look);
        desiredFov = 60;
        chase = true;
      }
    }
    if (!chase) {
      let fill = 0.9;
      look.set(field.length / 2, 0.5, field.width / 2);
      if (mode === 'field') {
        // Straight-down tactical view: frame the carpet edge to edge.
        direction.set(0, 1, 0.13).normalize();
        look.set(field.length / 2, 0.25, field.width / 2);
        desiredFov = 40;
        fill = 0.88;
      } else if (mode === 'orbit') {
        const angle = this.elapsed * 0.09 + 0.6;
        const elevation = 0.52;
        direction
          .set(
            Math.cos(elevation) * Math.cos(angle),
            Math.sin(elevation),
            Math.cos(elevation) * Math.sin(angle),
          )
          .normalize();
        fill = 0.9;
      } else {
        // Broadcast: a low three-quarter shot whose angle tracks the window, so
        // the field always spans the screen instead of floating in empty apron.
        const elevation = 0.52;
        const azimuth = this.broadcastAzimuth();
        direction
          .set(
            Math.cos(elevation) * Math.cos(azimuth),
            Math.sin(elevation),
            Math.cos(elevation) * Math.sin(azimuth),
          )
          .normalize();
      }
      // Framing depends only on the lens direction and the window shape, so
      // the fixed broadcast and top angles solve it once per aspect ratio
      // instead of running five projection passes every frame. The orbit
      // camera swings, so it keeps solving each frame.
      if (mode === 'orbit') {
        target.copy(look).addScaledVector(direction, this.fitDistance(look, direction, this.fieldFitPoints, fill, desiredFov));
      } else {
        const key = `${mode}|${this.camera.aspect.toFixed(4)}|${fill}|${desiredFov}`;
        if (key !== this.fitCacheKey) {
          this.fitCacheKey = key;
          this.fitCacheValue = this.fitDistance(look, direction, this.fieldFitPoints, fill, desiredFov);
        }
        target.copy(look).addScaledVector(direction, this.fitCacheValue);
      }
    }
    // The lighting rig is only drawn for the driver camera: from the wide
    // cameras it sits between the lens and the carpet.
    if (mode === 'driver') this.camera.layers.enable(1);
    else this.camera.layers.disable(1);
    // Name plates are only useful when the camera is close to a robot; from
    // the broadcast and top cameras they read as floating banners.
    for (const robot of this.robots.values()) {
      // Name plates identify the other robots, but up close they cover the very
      // thing they label, so they only show at a distance.
      const distance = robot.visual.group.position.distanceTo(this.camera.position);
      robot.label.visible =
        mode === 'driver' && robot.target.id !== this.focusRobotId && distance > 5.5 && distance < 22;
    }
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

  /** Shed pixel ratio, then bloom, if this machine cannot hold a smooth frame. */
  private adaptQuality(frameSeconds: number): void {
    if (!Number.isFinite(frameSeconds) || frameSeconds <= 0) return;
    if (frameSeconds > 1 / 26) this.slowFrames += 1;
    else this.slowFrames = 0;
    if (this.slowFrames < 40) return;
    this.slowFrames = 0;
    if (this.renderer.getPixelRatio() > 1.01) {
      this.renderer.setPixelRatio(1);
      this.resize();
      return;
    }
    if (this.postEnabled) this.postEnabled = false;
  }

  private animate = (): void => {
    const now = performance.now();
    const raw = (now - this.lastFrame) / 1000;
    const dt = Math.min(0.05, raw);
    this.lastFrame = now;
    this.elapsed += dt;
    this.adaptQuality(raw);
    const smooth = 1 - Math.exp(-10 * dt);
    for (const robot of this.robots.values()) {
      const group = robot.visual.group;
      const tx = robot.target.x;
      const tz = robot.target.y;
      group.position.x += (tx - group.position.x) * smooth;
      group.position.z += (tz - group.position.z) * smooth;
      // Drive over the BUMPs: the ramps are not physics obstacles, so lift and
      // pitch the chassis by the ramp profile under it.
      const rampHeight = bumpHeightAt(this.field, group.position.x, group.position.z);
      const slope = bumpSlopeAt(this.field, group.position.x, group.position.z);
      group.position.y = rampHeight;
      const rise = slope.x * Math.cos(robot.target.heading) + slope.y * Math.sin(robot.target.heading);
      robot.visual.setTerrain(robot.target.tipped ? 0 : Math.atan(rise));
      let desired = -robot.target.heading;
      let delta = (desired - group.rotation.y) % (Math.PI * 2);
      if (delta > Math.PI) delta -= Math.PI * 2;
      if (delta < -Math.PI) delta += Math.PI * 2;
      group.rotation.y += delta * smooth;
      robot.visual.update(robot.target, this.elapsed);
    }
    // Fuel interpolation, keeping shots smooth between 15 Hz snapshots.
    const display = this.fuelDisplay;
    const seen = this.fuelSeen;
    seen.clear();
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
      // FUEL height is already absolute: the simulation rests balls on the
      // carpet, the BUMP ramps, the HUB roof and the TRENCH roof itself.
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

    // HUB DMX bars, following the lighting table in §5.4: alliance colour at
    // full brightness when active, a white chase as the HUB comes back up, and
    // dark when the HUB is not active.
    for (const alliance of ['red', 'blue'] as const) {
      const active = this.hubActiveState[alliance];
      const since = this.elapsed - this.hubChangeAt[alliance];
      const bars = this.hubGlow[alliance];
      const base = alliance === 'red' ? RED : BLUE;
      // §5.4: three seconds before a HUB deactivates its bars pulse, then go
      // dark. Reading that off the period clock is what makes the lights feel
      // connected to the match instead of decorative.
      const periodLeft = this.snapshot ? this.snapshot.phaseDuration - this.snapshot.phaseTime : Infinity;
      const phase = this.snapshot?.phase;
      const warning =
        Boolean(this.snapshot) &&
        Boolean(phase === 'endgame' || (phase && phase.startsWith('shift')) || phase === 'auto') &&
        periodLeft <= 3 &&
        periodLeft > 0;
      bars.forEach((mat, index) => {
        if (!active) {
          mat.color.set('#2b323c');
          mat.emissive.set('#0a0d12');
          mat.emissiveIntensity = 0;
          return;
        }
        if (warning) {
          mat.color.copy(base);
          mat.emissive.copy(base);
          mat.emissiveIntensity = 0.5 + 0.6 * Math.abs(Math.sin(this.elapsed * 8));
          return;
        }
        if (since < 1.8) {
          const head = (since / 1.8) * bars.length;
          const lit = Math.abs(index - head) < 1.3;
          mat.color.copy(lit ? WHITE : base);
          mat.emissive.copy(lit ? WHITE : base);
          mat.emissiveIntensity = lit ? 2.6 : 0.45;
          return;
        }
        mat.color.copy(base);
        mat.emissive.copy(base);
        mat.emissiveIntensity = 1.35;
      });
    }
    // Driver-station LED stacks: solid when connected and enabled, blinking
    // when the robot is missing or the field is not enabling it.
    for (const led of this.stationLeds) {
      if (led.mode === 'solid') {
        led.mat.color.set(led.alliance === 'red' ? '#ff4a5c' : '#4ea0ff');
      } else if (led.mode === 'blink') {
        const on = Math.sin(this.elapsed * 6 + led.phase) > 0;
        led.mat.color.set(on ? (led.alliance === 'red' ? '#ff4a5c' : '#4ea0ff') : '#18212b');
      } else {
        led.mat.color.set('#18212b');
      }
    }

    this.updateCamera(dt);
    if (this.postEnabled && this.composer) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
  };

  dispose(): void {
    this.renderer.setAnimationLoop(null);
    this.resizeObserver.disconnect();
    this.composer?.dispose();
    this.bloom?.dispose();
    this.composer = null;
    this.bloom = null;
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
