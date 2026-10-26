import * as THREE from 'three';
import type { RobotConfig, RobotSnapshot } from '@rebuilt/shared';
import {
  makeBumperTexture,
  makeContactShadowTexture,
  makeFuelTexture,
  makeNetTexture,
  makePolyPanelTexture,
} from './textures';

export interface RobotVisual {
  group: THREE.Group;
  update: (state: RobotSnapshot, time: number) => void;
  /** Chassis pitch on the field's drivable BUMPs, radians, nose up positive. */
  setTerrain: (pitch: number) => void;
  setHighlight: (active: boolean) => void;
  dispose: () => void;
}

const ALLIANCE_RED = new THREE.Color('#ff4356');
const ALLIANCE_BLUE = new THREE.Color('#3f8bff');

/**
 * A 2026 REBUILT robot assembled from the same component choices as the
 * physics config: swerve or tank drive, rule-sized bumpers in the 2.5-5.75 in
 * zone, a wide ground intake, a polycarbonate hopper, a drum shooter and a
 * rear climber. Forward is +X so the field renderer can use rotation.y =
 * -heading; the whole machine is a little under 30 in tall (§R105).
 */
export function createRobotModel(config: RobotConfig, alliance: 'red' | 'blue'): RobotVisual {
  const group = new THREE.Group();
  const attitude = new THREE.Group();
  group.add(attitude);

  const L = config.chassis.length;
  const W = config.chassis.width;
  const H = config.chassis.height;

  const primary = new THREE.Color(config.skin.primary);
  const secondary = new THREE.Color(config.skin.secondary);
  const accent = new THREE.Color(config.skin.accent);
  const disposables: Array<THREE.BufferGeometry | THREE.Material | THREE.Texture> = [];

  const mat = (
    color: THREE.ColorRepresentation,
    options: Partial<THREE.MeshStandardMaterialParameters> = {},
  ): THREE.MeshStandardMaterial => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.2, ...options });
    disposables.push(m);
    return m;
  };
  const geo = <T extends THREE.BufferGeometry>(geometry: T): T => {
    disposables.push(geometry);
    return geometry;
  };
  const box = (
    material: THREE.Material,
    sx: number,
    sy: number,
    sz: number,
    x: number,
    y: number,
    z: number,
    parent: THREE.Object3D = attitude,
  ) => {
    const mesh = new THREE.Mesh(geo(new THREE.BoxGeometry(sx, sy, sz)), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const cylinder = (
    material: THREE.Material,
    radius: number,
    length: number,
    x: number,
    y: number,
    z: number,
    parent: THREE.Object3D = attitude,
    segments = 14,
  ) => {
    const mesh = new THREE.Mesh(geo(new THREE.CylinderGeometry(radius, radius, length, segments)), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };
  /** A thin strut between two local points, used for wiring and linkages. */
  const strut = (
    material: THREE.Material,
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    thickness = 0.014,
    parent: THREE.Object3D = attitude,
  ) => {
    const a = new THREE.Vector3(ax, ay, az);
    const b = new THREE.Vector3(bx, by, bz);
    const direction = new THREE.Vector3().subVectors(b, a);
    const mesh = new THREE.Mesh(geo(new THREE.BoxGeometry(thickness, direction.length(), thickness)), material);
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };

  const red = alliance === 'red';
  const allyColor = red ? '#c8102e' : '#0057b8';
  const dark = mat('#14181f', { metalness: 0.5, roughness: 0.42 });
  const black = mat('#0b0d11', { metalness: 0.3, roughness: 0.62 });
  const aluminium = mat('#b9c2cc', { metalness: 0.88, roughness: 0.26 });
  const machineAlu = mat('#9aa4af', { metalness: 0.8, roughness: 0.36 });
  const rubber = mat('#131313', { roughness: 0.94, metalness: 0.02 });
  const primaryMat = mat(primary, { roughness: 0.44, metalness: 0.15 });
  const secondaryMat = mat(secondary, { roughness: 0.58, metalness: 0.12 });
  const accentMat = mat(accent, { metalness: 0.4, roughness: 0.32 });
  const bumperMat = mat(allyColor, { roughness: 0.86, metalness: 0.02 });
  const panelTex = makePolyPanelTexture(secondary.getStyle());
  disposables.push(panelTex);
  const panelMat = new THREE.MeshStandardMaterial({
    map: panelTex,
    roughness: 0.28,
    metalness: 0.15,
    transparent: true,
    // Clear polycarbonate, not frosted acrylic: the drive team has to see the
    // FUEL load through the hopper wall.
    opacity: 0.34,
  });
  disposables.push(panelMat);
  const netTex = makeNetTexture();
  netTex.repeat.set(2, 1.4);
  disposables.push(netTex);
  const netMat = new THREE.MeshBasicMaterial({
    map: netTex,
    transparent: true,
    opacity: 0.55,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  disposables.push(netMat);
  const ledMat = new THREE.MeshBasicMaterial({
    color: red ? '#ff4553' : '#4a94ff',
    toneMapped: false,
  });
  disposables.push(ledMat);

  const frameL = L * 0.86;
  const frameW = W * 0.84;
  const railY = 0.145;

  // ---------------------------------------------------------------- drivetrain
  // Chassis: 1 x 2 in box tube rails with corner gussets and a belly pan, the
  // shape every FRC frame reads as from above.
  for (const z of [-frameW / 2, frameW / 2]) {
    box(aluminium, frameL, 0.05, 0.045, 0, railY, z);
    box(black, frameL * 0.98, 0.006, 0.05, 0, railY + 0.03, z);
  }
  for (const x of [-frameL / 2, frameL / 2]) {
    box(aluminium, 0.045, 0.05, frameW, x, railY, 0);
  }
  box(black, frameL - 0.05, 0.012, frameW - 0.05, 0, 0.118, 0);
  for (const x of [-frameL / 2 + 0.02, frameL / 2 - 0.02]) {
    for (const z of [-frameW / 2 + 0.02, frameW / 2 - 0.02]) {
      box(machineAlu, 0.075, 0.075, 0.075, x, railY, z);
    }
  }

  const wheels: THREE.Mesh[] = [];
  const swerve = config.drive === 'swerve';
  // Real wheel sizes: SDS modules run a 4 in x 1.5 in wheel, a classic tank
  // base runs 6 in x 1.5 in. Wheel diameter is what makes the robot's stance
  // read correctly next to 5.91 in FUEL, so neither is fudged.
  const wheelRadius = swerve ? 0.0508 : 0.0762;
  const wheelGeo = geo(new THREE.CylinderGeometry(wheelRadius, wheelRadius, swerve ? 0.038 : 0.038, 18));
  const hubGeo = geo(new THREE.CylinderGeometry(0.026, 0.026, 0.046, 12));
  // The holder lays the cylinder on its side (axle along Z) so the mesh itself
  // can spin about its own axis with rotation.y, exactly like a real wheel.
  const addWheel = (x: number, z: number, parent: THREE.Object3D) => {
    const holder = new THREE.Group();
    holder.position.set(x, wheelRadius, z);
    holder.rotation.x = Math.PI / 2;
    parent.add(holder);
    const wheel = new THREE.Mesh(wheelGeo, rubber);
    wheel.castShadow = true;
    holder.add(wheel);
    const hub = new THREE.Mesh(hubGeo, machineAlu);
    holder.add(hub);
    wheels.push(wheel);
    return holder;
  };

  const spinGroup = new THREE.Group();
  attitude.add(spinGroup);
  if (swerve) {
    // Four SDS MK5n modules. The plate is 5 in across and 7.5 in along the
    // frame, carries a corner-biased 4 in wheel under a bevel-gear stack, and
    // has a Kraken X60 on each axis. Nothing here is a generic box.
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const x = sx * (frameL / 2 - 0.105);
        const z = sz * (frameW / 2 - 0.085);
        box(machineAlu, 0.19, 0.014, 0.127, x, 0.202, z);
        // Chassis mounting flanges along the 7.5 in axis.
        for (const dz of [-0.05, 0.05]) {
          box(aluminium, 0.19, 0.03, 0.014, x, 0.186, z + dz);
        }
        // Steering bearing the module rotates on.
        const bearing = cylinder(machineAlu, 0.046, 0.016, x, 0.18, z, attitude, 22);
        void bearing;
        const fork = new THREE.Group();
        fork.position.set(x, 0, z);
        attitude.add(fork);
        for (const dz of [-0.028, 0.028]) {
          box(machineAlu, 0.115, 0.1, 0.009, 0, 0.115, dz, fork);
        }
        // Bevel gear and axle between the fork plates.
        const bevel = cylinder(dark, 0.024, 0.052, 0, 0.16, 0, fork, 12);
        bevel.rotation.x = Math.PI / 2;
        addWheel(sx * 0.026, 0, fork);
        assemblyForward(fork, sx);
        // Drive motor lying along the frame, steering motor upright, both 2.37
        // in across, with the Talon FX end cap facing out.
        const drive = cylinder(dark, 0.03, 0.075, x + sx * 0.058, 0.238, z, attitude, 14);
        drive.rotation.z = Math.PI / 2;
        const driveCap = cylinder(secondaryMat, 0.031, 0.008, x + sx * 0.099, 0.238, z, attitude, 14);
        driveCap.rotation.z = Math.PI / 2;
        cylinder(dark, 0.03, 0.075, x - sx * 0.05, 0.238, z - sz * 0.03, attitude, 14);
        cylinder(secondaryMat, 0.031, 0.008, x - sx * 0.05, 0.278, z - sz * 0.03, attitude, 14);
        // Steering encoder tucked into the module plate.
        box(black, 0.028, 0.018, 0.028, x, 0.214, z + sz * 0.038);
      }
    }
  } else {
    // Tank / mecanum base: 2 x 1 in rails, three 6 in wheels a side on a
    // dropped centre, a chain run behind a guard and a gearbox on each side.
    for (const sz of [-1, 1]) {
      box(machineAlu, frameL * 0.96, 0.016, 0.2, 0, 0.2, sz * (frameW / 2 - 0.1));
      box(machineAlu, frameL * 0.94, 0.05, 0.02, 0, 0.13, sz * (frameW / 2 - 0.05));
      for (const dx of [-0.33, 0, 0.33]) {
        const fork = new THREE.Group();
        fork.position.set(dx * frameL, 0, sz * (frameW / 2 - 0.04));
        attitude.add(fork);
        addWheel(0, 0, fork);
      }
      // Chain run between the wheels, behind a black guard.
      box(black, frameL * 0.74, 0.045, 0.02, 0, 0.11, sz * (frameW / 2 - 0.015));
      for (let i = -2; i <= 2; i++) {
        box(rubber, 0.012, 0.03, 0.024, i * frameL * 0.13, 0.11, sz * (frameW / 2 - 0.015));
      }
      // Gearbox and a pair of NEOs along the rail.
      box(machineAlu, 0.11, 0.1, 0.07, -frameL * 0.18, 0.19, sz * (frameW / 2 - 0.14));
      const motor = cylinder(dark, 0.03, 0.062, -frameL * 0.06, 0.2, sz * (frameW / 2 - 0.145), attitude, 12);
      motor.rotation.z = Math.PI / 2;
      const motor2 = cylinder(dark, 0.03, 0.062, frameL * 0.06, 0.2, sz * (frameW / 2 - 0.145), attitude, 12);
      motor2.rotation.z = Math.PI / 2;
    }
    box(black, 0.3, 0.02, frameW - 0.05, 0, 0.09, 0);
  }

  // Bumpers per R402-R412: 4.5 in of covered foam on a hard backer, filling
  // the R405 zone from 2.5 to 5.75 in off the carpet, extending 2.28 in past
  // the frame (R403 caps it at 4 in). The number is printed on every face so
  // the robot satisfies R412's three-locations-90-degrees-apart rule.
  const bumperTex = makeBumperTexture(config.teamNumber, alliance, config.name);
  disposables.push(bumperTex);
  const bumperFaceMat = new THREE.MeshStandardMaterial({ map: bumperTex, roughness: 0.88, metalness: 0.02 });
  disposables.push(bumperFaceMat);
  const bumperThick = 0.058;
  const bumperH = 0.1143;
  const bumperY = 0.0892;
  const extendX = L / 2 + bumperThick / 2;
  const extendZ = W / 2 + bumperThick / 2;
  // Box material order is [+x, -x, +y, -y, +z, -z]. Only the outward face
  // carries the printed cover, which is how the numbers stay legible on all
  // four sides without stretching around the corners.
  const cover = (index: number): THREE.Material[] => {
    const faces: THREE.Material[] = [bumperMat, bumperMat, bumperMat, bumperMat, bumperMat, bumperMat];
    faces[index] = bumperFaceMat;
    return faces;
  };
  const bumperBox = (sx: number, sy: number, sz: number, x: number, y: number, z: number, faceIndex: number) => {
    const mesh = new THREE.Mesh(geo(new THREE.BoxGeometry(sx, sy, sz)), cover(faceIndex));
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    attitude.add(mesh);
    return mesh;
  };
  bumperBox(bumperThick, bumperH, W + bumperThick * 2, extendX, bumperY, 0, 0);
  bumperBox(bumperThick, bumperH, W + bumperThick * 2, -extendX, bumperY, 0, 1);
  bumperBox(L + bumperThick * 2, bumperH, bumperThick, 0, bumperY, extendZ, 4);
  bumperBox(L + bumperThick * 2, bumperH, bumperThick, 0, bumperY, -extendZ, 5);
  // Hard backer + top cap, and the mounting brackets that hold the bumpers on.
  for (const sz of [-1, 1]) {
    box(black, L + bumperThick * 2, 0.012, 0.012, 0, bumperY + bumperH / 2, sz * (W / 2 + bumperThick * 0.4));
  }
  for (const sx of [-1, 1]) {
    box(black, 0.012, 0.012, W + bumperThick * 2, sx * (L / 2 + bumperThick * 0.4), bumperY + bumperH / 2, 0);
  }
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      box(machineAlu, 0.05, 0.05, 0.05, sx * (L / 2 - 0.03), bumperY + 0.06, sz * (W / 2 - 0.03));
    }
  }

  // ------------------------------------------------------------- electronics
  // The 2026 electronics stack at its real envelopes: an MK ES17-12 battery
  // (7.1 x 3.0 x 6.6 in), a 120 A main breaker, a REV Power Distribution Hub
  // (8.875 x 4.375 x 1.563 in), a roboRIO 2 (5.75 x 5.64 x 1.37 in) and a
  // VH-109 radio, all on a polycarbonate board low in the frame.
  // Everything under the 8.7 in hopper floor, stacked the way teams pack it:
  // battery on the belly pan, electronics board on standoffs above it.
  const boardY = 0.15;
  box(black, frameL * 0.56, 0.012, frameW * 0.64, -0.02, boardY, 0);
  // Battery, low and towards the alliance wall to keep the CG back.
  box(mat('#20242b', { roughness: 0.6 }), 0.18, 0.076, 0.168, -0.13, 0.128, frameW * 0.22);
  box(mat('#c0392b', { roughness: 0.7 }), 0.05, 0.006, 0.04, -0.13, 0.169, frameW * 0.22);
  // 6 AWG leads: red through the breaker, black to the frame ground.
  strut(mat('#c0392b', { roughness: 0.8 }), -0.06, 0.16, frameW * 0.22, 0.02, 0.17, frameW * 0.1, 0.012);
  strut(black, -0.2, 0.13, frameW * 0.3, -0.02, 0.11, frameW * 0.12, 0.012);
  box(mat('#b03a2c', { roughness: 0.7 }), 0.05, 0.045, 0.05, 0.02, 0.17, frameW * 0.1);
  // PDH flat on the board with its breaker slots facing the battery.
  box(mat('#1d232b', { metalness: 0.45, roughness: 0.5 }), 0.225, 0.04, 0.111, 0.06, boardY + 0.028, -frameW * 0.18);
  for (let i = 0; i < 12; i++) {
    box(accentMat, 0.008, 0.008, 0.012, -0.048 + i * 0.017, boardY + 0.05, -frameW * 0.18 + 0.03);
  }
  // roboRIO 2 beside it, with the yellow status LED.
  box(mat('#8a939e', { metalness: 0.6, roughness: 0.4 }), 0.146, 0.035, 0.143, 0.16, boardY + 0.024, -frameW * 0.06);
  box(mat('#e0b93a', { roughness: 0.6 }), 0.018, 0.01, 0.03, 0.16, boardY + 0.044, -frameW * 0.06);
  // VH-109 radio and its Ethernet pigtail.
  box(mat('#23282f', { roughness: 0.55 }), 0.12, 0.03, 0.1, 0.17, boardY + 0.02, frameW * 0.18);
  strut(black, 0.17, boardY + 0.04, frameW * 0.18, 0.1, boardY + 0.055, frameW * 0.06, 0.006);
  // Motor controllers on the frame rails: a Spark MAX per mechanism side.
  for (const sz of [-1, 1]) {
    box(mat('#2e7d8f', { roughness: 0.65 }), 0.05, 0.04, 0.075, -0.23, boardY + 0.02, sz * frameW * 0.36);
  }
  // CAN and power loom, bundled with a zip tie or two.
  strut(black, 0.02, 0.165, -frameW * 0.18, 0.2, 0.165, -frameW * 0.3, 0.012);
  strut(mat('#d7b83a', { roughness: 0.7 }), -0.16, 0.24, frameW * 0.3, 0.24, 0.17, frameW * 0.34, 0.01);

  // ------------------------------------------------------------------ intake
  // A full-width floor intake on linear slides, the arrangement most 2026
  // robots converged on: two 4 in rollers on green compliant wheels, polycarb
  // side plates, and up to 12 in of deployment (R105) when it is running.
  const intakeGroup = new THREE.Group();
  attitude.add(intakeGroup);
  let intakeRoller: THREE.Mesh | null = null;
  const intakeWidth = Math.min(W, Math.max(config.intake.width, W * 0.78));
  if (config.intake.enabled) {
    // Stowed, the mouth sits just inside the bumper face; when it runs it
    // slides 7 in forward. Nothing pokes out of the frame at kickoff.
    const reach = L / 2 + 0.06;
    for (const sz of [-1, 1]) {
      // Side plate that runs the full depth of the intake, plus the 2 x 1 in
      // slide tube it rides on.
      const plate = box(panelMat, 0.26, 0.14, 0.008, L / 2 - 0.08, 0.085, sz * (intakeWidth / 2 + 0.004), intakeGroup);
      plate.rotation.z = -0.05;
      box(aluminium, 0.22, 0.026, 0.026, L / 2 - 0.14, 0.17, sz * (intakeWidth / 2 - 0.02), intakeGroup);
    }
    box(dark, 0.07, 0.06, intakeWidth + 0.02, L / 2 - 0.06, 0.17, 0, intakeGroup);
    // Leading roller and the smaller upper roller that kicks FUEL into the
    // hopper, both on 4 in compliant wheels.
    const rollerGeo = geo(new THREE.CylinderGeometry(0.035, 0.035, intakeWidth, 14));
    intakeRoller = new THREE.Mesh(rollerGeo, mat('#1f242b', { roughness: 0.85 }));
    intakeRoller.rotation.x = Math.PI / 2;
    intakeRoller.position.set(reach, 0.05, 0);
    intakeRoller.castShadow = true;
    intakeGroup.add(intakeRoller);
    const upperRoller = new THREE.Mesh(
      geo(new THREE.CylinderGeometry(0.028, 0.028, intakeWidth, 14)),
      mat('#1f242b', { roughness: 0.85 }),
    );
    upperRoller.rotation.x = Math.PI / 2;
    upperRoller.position.set(reach - 0.1, 0.15, 0);
    intakeGroup.add(upperRoller);
    const compliantMat = mat('#2f8f4e', { roughness: 0.8 });
    const compliantGeo = geo(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 14));
    // Three wheels on the leading roller, two on the upper one: four green
    // donuts on each read as a ladder at any distance.
    for (const frac of [-0.34, 0, 0.34]) {
      const wheel = new THREE.Mesh(compliantGeo, compliantMat);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(reach, 0.05, frac * intakeWidth);
      intakeGroup.add(wheel);
    }
    for (const frac of [-0.26, 0.26]) {
      const wheel = new THREE.Mesh(compliantGeo, compliantMat);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(reach - 0.1, 0.15, frac * intakeWidth);
      intakeGroup.add(wheel);
    }
    // Sprockets and the short chain on one end of each roller.
    for (const [rx, ry] of [[reach, 0.05], [reach - 0.11, 0.14]] as const) {
      const sprocket = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.018, 0.018, 0.012, 10)), aluminium);
      sprocket.rotation.x = Math.PI / 2;
      sprocket.position.set(rx, ry, intakeWidth / 2 + 0.02);
      intakeGroup.add(sprocket);
    }
    box(accentMat, 0.02, 0.1, 0.05, reach + 0.02, 0.11, intakeWidth / 2 + 0.03, intakeGroup);
    box(accentMat, 0.02, 0.1, 0.05, reach + 0.02, 0.11, -intakeWidth / 2 - 0.03, intakeGroup);
  }

  // ------------------------------------------------------------------- hopper
  // The net-hopper every 2026 robot ended up building: 1 x 1 in uprights, clear
  // polycarbonate sides, a belt floor tipped towards the shooter so FUEL feeds
  // forward, and a net back that lets the drive team see the load.
  // The hopper body runs from the frame rails up, not from a shelf in mid air:
  // the clear sides enclose the electronics bay and the load in one volume, the
  // way a real robot's superstructure does.
  const hopperBase = railY + 0.02;
  const hopperFloor = 0.22;
  const hopperTop = 0.46;
  const hopperL = frameL * 0.9;
  const hopperW = frameW * 0.86;
  const floor = box(black, hopperL, 0.012, hopperW, -0.02, hopperFloor, 0);
  floor.rotation.z = 0.05;
  // Two polycord belts running up the floor, plus the indexer at the front.
  for (const dz of [-0.16, 0.16]) {
    box(rubber, hopperL * 0.96, 0.004, 0.05, -0.02, hopperFloor + 0.008, dz * hopperW);
  }
  const indexer = cylinder(rubber, 0.026, hopperW * 0.8, -hopperL / 2 + 0.06, hopperFloor + 0.06, 0, attitude, 12);
  indexer.rotation.x = Math.PI / 2;
  for (const sz of [-1, 1]) {
    box(panelMat, hopperL, hopperTop - hopperBase, 0.008, -0.02, (hopperTop + hopperBase) / 2, sz * hopperW / 2);
    // 1 x 1 in uprights at each corner of the hopper.
    for (const sx of [-1, 1]) {
      box(aluminium, 0.026, hopperTop - hopperBase, 0.026, sx * (hopperL / 2) - 0.02, (hopperTop + hopperBase) / 2, sz * hopperW / 2);
    }
  }
  // Polycarbonate front wall above the intake, carrying the team plate.
  box(panelMat, 0.008, hopperTop - hopperBase, hopperW, hopperL / 2 - 0.02, (hopperTop + hopperBase) / 2, 0);
  const netPlane = new THREE.Mesh(geo(new THREE.PlaneGeometry(hopperW * 0.92, hopperTop - hopperFloor)), netMat);
  netPlane.position.set(-hopperL / 2 - 0.01, (hopperTop + hopperFloor) / 2, 0);
  netPlane.rotation.y = Math.PI / 2;
  attitude.add(netPlane);
  // Tension cables over the net, as teams run them to keep FUEL in.
  for (const sz of [-1, 1]) {
    strut(black, -hopperL / 2 + 0.02, hopperTop + 0.02, sz * hopperW * 0.36, -hopperL * 0.2, hopperTop + 0.05, sz * hopperW * 0.4, 0.008);
  }
  // Team plate above the bumper on both flanks.
  const sidePlateGeo = geo(new THREE.PlaneGeometry(0.3, 0.1));
  for (const sz of [-1, 1]) {
    const plate = new THREE.Mesh(sidePlateGeo, primaryMat);
    plate.position.set(0, hopperTop - 0.055, sz * (hopperW / 2 + 0.006));
    plate.rotation.y = sz > 0 ? 0 : Math.PI;
    attitude.add(plate);
    box(accentMat, 0.3, 0.008, 0.006, 0, hopperTop - 0.11, sz * (hopperW / 2 + 0.006));
  }

  // Skin pattern on the hopper side panels.
  if (config.skin.pattern === 'stripes') {
    for (const sz of [-1, 1]) {
      for (const dx of [-0.1, 0.02, 0.14]) {
        box(accentMat, 0.05, hopperTop - hopperFloor - 0.02, 0.01, dx, (hopperTop + hopperFloor) / 2, sz * (hopperW / 2 + 0.002));
      }
    }
  } else if (config.skin.pattern === 'checker') {
    for (const sz of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        box(i % 2 === 0 ? accentMat : primaryMat, 0.07, 0.07, 0.01, -0.12 + i * 0.08, hopperTop - 0.06, sz * (hopperW / 2 + 0.002));
      }
    }
  } else if (config.skin.pattern === 'hex') {
    const hexGeo = geo(new THREE.CylinderGeometry(0.05, 0.05, 0.01, 6));
    for (const sz of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const hex = new THREE.Mesh(hexGeo, accentMat);
        hex.rotation.x = Math.PI / 2;
        hex.position.set(-0.1 + i * 0.1, hopperTop - 0.07, sz * (hopperW / 2 + 0.002));
        attitude.add(hex);
      }
    }
  }

  // ------------------------------------------------------------------ shooter
  // Drum shooter with a hood, angled up over the hopper. The drum spins when
  // the robot has FUEL, so the launcher reads as live machinery.
  const shooterGroup = new THREE.Group();
  attitude.add(shooterGroup);
  let drum: THREE.Mesh | null = null;
  if (config.shooter.enabled) {
    // Drum over the front of the hopper, firing forward over the intake, with
    // a pedestal down to the hopper rail so it is mounted rather than floating.
    shooterGroup.position.set(0.14, hopperTop + 0.05, 0);
    shooterGroup.rotation.z = 0.26;
    box(machineAlu, 0.18, 0.05, frameW * 0.5, -0.08, -0.055, 0, shooterGroup);
    // Side plates rather than a solid tray: a shooter is a frame with a drum in
    // it, and a full-width plate would hide the hopper under it.
    for (const sz of [-1, 1]) {
      box(aluminium, 0.26, 0.12, 0.012, 0, 0.01, sz * frameW * 0.35, shooterGroup);
      box(dark, 0.24, 0.03, 0.03, 0, -0.055, sz * frameW * 0.34, shooterGroup);
    }
    drum = new THREE.Mesh(
      geo(new THREE.CylinderGeometry(0.072, 0.072, frameW * 0.6, 18)),
      mat('#20262f', { metalness: 0.6, roughness: 0.35 }),
    );
    drum.rotation.x = Math.PI / 2;
    drum.position.set(0.01, 0.045, 0);
    drum.castShadow = true;
    shooterGroup.add(drum);
    // Hood over the top of the drum, open at the muzzle.
    const hood = new THREE.Mesh(
      geo(new THREE.CylinderGeometry(0.086, 0.086, frameW * 0.62, 18, 1, true, Math.PI * 0.15, Math.PI * 0.7)),
      primaryMat,
    );
    hood.rotation.x = Math.PI / 2;
    hood.position.set(0.005, 0.05, 0);
    shooterGroup.add(hood);
    for (const sz of [-1, 1]) {
      const disc = cylinder(machineAlu, 0.055, 0.008, 0.01, 0.045, sz * frameW * 0.31, shooterGroup, 16);
      disc.rotation.x = Math.PI / 2;
    }
    // Feed rollers between hopper and drum.
    for (const dx of [-0.1, -0.02]) {
      const feed = cylinder(rubber, 0.028, frameW * 0.5, dx, -0.035, 0, shooterGroup, 12);
      feed.rotation.x = Math.PI / 2;
    }
    // Muzzle lip on the hood, not a free-floating ring.
    for (const sz of [-1, 1]) {
      box(accentMat, 0.02, 0.06, 0.02, 0.13, 0.03, sz * frameW * 0.35, shooterGroup);
    }
    // Hood pivot and the adjustment screw teams tune shot angle with.
    for (const sz of [-1, 1]) {
      box(machineAlu, 0.05, 0.05, 0.012, -0.1, 0.02, sz * frameW * 0.36, shooterGroup);
    }
    strut(aluminium, -0.11, 0.02, frameW * 0.3, -0.13, 0.11, frameW * 0.24, 0.006, shooterGroup);
    // Limelight-style vision camera aimed downfield, with its lens lit.
    box(dark, 0.06, 0.045, 0.1, 0.1, 0.12, frameW * 0.22, shooterGroup);
    const vision = new THREE.Mesh(
      geo(new THREE.SphereGeometry(0.014, 8, 6)),
      mat('#59e3ff', { emissive: '#147e94', emissiveIntensity: 1.4 }),
    );
    vision.position.set(0.132, 0.12, frameW * 0.22);
    shooterGroup.add(vision);
  }

  // ------------------------------------------------------------------ climber
  // Rear elevator/climber: box-tube mast, carriage and a hook for the TOWER
  // rungs. It doubles as the arm mechanism when the config asks for one.
  const armGroup = new THREE.Group();
  attitude.add(armGroup);
  // Keep the deployed machine inside the 30 in (0.762 m) height limit.
  const climbHeight = Math.min(0.3, 0.17 + config.climber.maxLevel * 0.045 + (config.arm.enabled ? 0.03 : 0));
  if (config.climber.enabled || config.arm.enabled) {
    // Three nested box-tube stages, so it reads as a telescope rather than a
    // fixed mast. That is how 2026 robots reach the rungs inside R107's 30 in.
    // The mast is bolted to the rear frame rail and runs up past the hopper, so
    // it has a real load path instead of starting in mid air.
    const mastX = -frameL / 2 - 0.012;
    const mastBase = railY;
    const mastTop = H + climbHeight;
    const stages = 3;
    const stageH = (mastTop - mastBase) / 2.1;
    for (let stage = 0; stage < stages; stage++) {
      const size = 0.058 - stage * 0.011;
      const y = mastBase + (stage * (mastTop - mastBase - stageH)) / (stages - 1);
      for (const sz of [-1, 1]) {
        box(aluminium, size, stageH, size, mastX, y + stageH / 2, sz * 0.055, armGroup);
      }
      // Cross bolt at every stage joint.
      box(machineAlu, size + 0.008, 0.012, 0.13, mastX, y + stageH - 0.01, 0, armGroup);
    }
    box(machineAlu, 0.05, 0.035, 0.22, mastX, mastTop, 0, armGroup);
    const carriage = box(secondaryMat, 0.06, 0.08, 0.22, mastX + 0.03, mastBase + 0.13, 0, armGroup);
    void carriage;
    if (config.climber.enabled) {
      const hook = new THREE.Mesh(
        geo(new THREE.TorusGeometry(0.06, 0.014, 8, 16, Math.PI * 1.35)),
        accentMat,
      );
      hook.rotation.y = Math.PI / 2;
      hook.position.set(mastX, mastTop + 0.05, 0);
      armGroup.add(hook);
      // Winch drum and cable at the base of the mast.
      const winch = cylinder(dark, 0.045, 0.12, mastX, mastBase + 0.05, 0, armGroup, 12);
      winch.rotation.x = Math.PI / 2;
      strut(black, mastX, mastTop - 0.02, 0, mastX + 0.01, mastBase + 0.08, 0, 0.008, armGroup);
      // Ratchet pawl so the carriage holds height if power drops.
      const pawl = box(machineAlu, 0.02, 0.05, 0.03, mastX + 0.03, mastBase + 0.11, 0.06, armGroup);
      pawl.rotation.z = -0.35;
    }
    if (config.arm.enabled && config.arm.style === 'arm') {
      const shoulder = new THREE.Group();
      shoulder.position.set(mastX, mastTop - 0.15, 0);
      shoulder.rotation.z = 0.9;
      armGroup.add(shoulder);
      box(machineAlu, 0.34, 0.05, 0.11, 0.17, 0, 0, shoulder);
      box(accentMat, 0.07, 0.07, 0.13, 0.33, 0, 0, shoulder);
    }
  }

  // ------------------------------------------------------------ sensors, LED
  if (config.sensors.fuelDetector || config.sensors.autoAlign) {
    box(dark, 0.07, 0.055, 0.1, frameL / 2 - 0.06, hopperTop + 0.01, frameW * 0.28);
    const lens = new THREE.Mesh(
      geo(new THREE.SphereGeometry(0.018, 10, 8)),
      mat('#59e3ff', { emissive: '#147e94', emissiveIntensity: 1.6, metalness: 0.2 }),
    );
    lens.position.set(frameL / 2 - 0.024, hopperTop + 0.01, frameW * 0.28);
    attitude.add(lens);
  }
  // Alliance LED strip down both flanks.
  for (const sz of [-1, 1]) {
    box(ledMat, frameL * 0.7, 0.012, 0.006, 0, 0.175, sz * (frameW / 2 + 0.004));
  }

  // FUEL visible in the hopper while the robot is carrying.
  const carryGroup = new THREE.Group();
  attitude.add(carryGroup);
  // FUEL is 5.91 in across, so a 27 in robot hopper holds them in a tight
  // three-across grid with a second layer riding on top of the first.
  const carryGeo = geo(new THREE.SphereGeometry(0.075, 10, 9));
  const carryTex = makeFuelTexture();
  disposables.push(carryTex);
  const carryMat = mat('#ffffff', {
    map: carryTex,
    roughness: 0.9,
    metalness: 0.02,
    emissive: '#2a2000',
    emissiveIntensity: 0.15,
  });
  const carrySlots: Array<[number, number, number]> = [];
  // A real hopper load piles above the rim, so show three layers; the state's
  // carrying count decides how many of the 27 slots are visible.
  for (let layer = 0; layer < 3; layer++) {
    for (let ix = -1; ix <= 1; ix++) {
      for (let iz = -1; iz <= 1; iz++) {
        carrySlots.push([ix * 0.14 - 0.05, hopperFloor + 0.08 + layer * 0.135, iz * 0.15]);
      }
    }
  }
  for (const [x, y, z] of carrySlots) {
    const ball = new THREE.Mesh(carryGeo, carryMat);
    ball.position.set(x, y, z);
    ball.visible = false;
    carryGroup.add(ball);
  }

  // Disabled beacon on the hopper rail.
  const beaconMat = new THREE.MeshStandardMaterial({
    color: '#2b0707',
    emissive: '#ff2b2b',
    emissiveIntensity: 0.3,
  });
  disposables.push(beaconMat);
  // A rotating-beacon stack on a bracket, clipped to the hopper rail.
  const beacon = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.022, 0.022, 0.05, 10)), beaconMat);
  beacon.position.set(-hopperL / 2 + 0.05, hopperTop + 0.035, hopperW / 2 - 0.03);
  attitude.add(beacon);
  box(black, 0.02, 0.02, 0.02, -hopperL / 2 + 0.05, hopperTop + 0.005, hopperW / 2 - 0.03);

  // Field-facing status ring and the highlight used for the player's robot.
  // Contact shadow: a soft dark patch under the frame beds the robot into the
  // carpet even when the renderer is running without shadow maps.
  const shadowTex = makeContactShadowTexture();
  disposables.push(shadowTex);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: shadowTex,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
  disposables.push(shadowMat);
  const shadow = new THREE.Mesh(geo(new THREE.PlaneGeometry(L * 1.5, W * 1.5)), shadowMat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.004;
  shadow.renderOrder = 2;
  group.add(shadow);

  const ringMat = new THREE.MeshBasicMaterial({
    color: red ? ALLIANCE_RED : ALLIANCE_BLUE,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
  });
  disposables.push(ringMat);
  const ring = new THREE.Mesh(geo(new THREE.TorusGeometry(L * 0.62, 0.012, 6, 40)), ringMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.016;
  group.add(ring);

  const highlightMat = new THREE.MeshBasicMaterial({
    color: '#ffcf3f',
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const highlight = new THREE.Mesh(geo(new THREE.TorusGeometry(L * 0.74, 0.02, 8, 44)), highlightMat);
  highlight.rotation.x = Math.PI / 2;
  highlight.position.y = 0.024;
  group.add(highlight);

  let terrainPitch = 0;
  let lastState: RobotSnapshot | null = null;
  let lastTime = 0;
  let wheelAngle = 0;

  function assemblyForward(fork: THREE.Group, sx: number) {
    // Steering angle is cosmetic: a parked module reads as a rotated wheel.
    fork.rotation.y = sx * 0.22;
  }

  return {
    group,
    update(state: RobotSnapshot, time: number) {
      const dt = Math.min(0.05, Math.max(0, time - lastTime));
      lastTime = time;
      lastState = state;
      attitude.position.y = 0;
      attitude.rotation.z = (state.tipped ? Math.PI / 2.1 : 0) + terrainPitch;
      attitude.rotation.x = state.tipped ? 0.18 : 0;
      if (state.tipped) attitude.position.y = 0.34;
      const climbBoost = state.climb.level * 0.36 + (state.climb.active ? 0.06 : 0);
      attitude.position.y += climbBoost;
      if (state.climb.active) attitude.rotation.z += Math.sin(time * 9) * 0.01;

      // Wheels roll at the robot's real speed; the drum and intake spin with
      // their mechanisms so a moving robot never looks frozen.
      const speed = Math.hypot(state.vx, state.vy);
      wheelAngle += (speed / wheelRadius) * dt;
      for (const wheel of wheels) wheel.rotation.y = wheelAngle;
      if (drum) drum.rotation.y += (state.carrying > 0 ? 26 : 6) * dt;
      if (intakeRoller) intakeRoller.rotation.y -= 9 * dt * (state.intakeActive ? 2.4 : 0.5);

      if (config.arm.enabled) {
        const targetX = state.expanded ? 0.12 : 0.34;
        armGroup.position.x += (targetX - armGroup.position.x) * 0.15;
      }
  if (config.intake.enabled) {
    // The intake runs out whenever it is picking up, not only when the arm is
    // flagged as extended.
    const targetX = state.expanded || state.intakeActive ? 0.18 : 0;
    intakeGroup.position.x += (targetX - intakeGroup.position.x) * 0.16;
  }
      carryGroup.children.forEach((child, i) => {
        child.visible = i < Math.min(state.carrying, carrySlots.length);
      });

      if (state.disabled || state.disqualified) {
        beaconMat.emissiveIntensity = 2.4 * (0.4 + 0.6 * Math.abs(Math.sin(time * 3)));
        ringMat.color.set('#ff3040');
        ringMat.opacity = 0.35;
        ledMat.color.set('#ff3040');
      } else if (state.pinned) {
        ringMat.color.set('#ffc83d');
        ringMat.opacity = 0.9;
        beaconMat.emissiveIntensity = 0.3;
        ledMat.color.set('#ffc83d');
      } else {
        ringMat.color.copy(red ? ALLIANCE_RED : ALLIANCE_BLUE);
        ringMat.opacity = 0.5;
        beaconMat.emissiveIntensity = 0.3;
        ledMat.color.set(red ? '#ff4553' : '#4a94ff');
      }
      if (state.climb.level > 0) ringMat.opacity = 0.85;
    },
    setTerrain(pitch: number) {
      terrainPitch = pitch;
      if (lastState) {
        attitude.rotation.z = (lastState.tipped ? Math.PI / 2.1 : 0) + pitch;
      }
    },
    setHighlight(active: boolean) {
      highlightMat.opacity = active ? 0.9 : 0;
    },
    dispose() {
      for (const item of disposables) item.dispose();
      group.clear();
    },
  };
}
