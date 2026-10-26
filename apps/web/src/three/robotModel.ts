import * as THREE from 'three';
import type { RobotConfig, RobotSnapshot } from '@rebuilt/shared';
import { makeBumperTexture, makeContactShadowTexture, makeNetTexture, makePolyPanelTexture } from './textures';

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
    roughness: 0.42,
    metalness: 0.2,
    transparent: true,
    opacity: 0.86,
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
  const wheelGeo = geo(new THREE.CylinderGeometry(0.051, 0.051, 0.048, 16));
  const hubGeo = geo(new THREE.CylinderGeometry(0.026, 0.026, 0.054, 12));
  // The holder lays the cylinder on its side (axle along Z) so the mesh itself
  // can spin about its own axis with rotation.y, exactly like a real wheel.
  const addWheel = (x: number, z: number, parent: THREE.Object3D) => {
    const holder = new THREE.Group();
    holder.position.set(x, 0.051, z);
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

  const swerve = config.drive === 'swerve';
  const spinGroup = new THREE.Group();
  attitude.add(spinGroup);
  if (swerve) {
    // Four corner modules: fork, 4 in wheel, steering ring and two Krakens.
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const x = sx * (frameL / 2 - 0.085);
        const z = sz * (frameW / 2 - 0.075);
        box(machineAlu, 0.155, 0.05, 0.155, x, 0.196, z);
        box(aluminium, 0.17, 0.014, 0.17, x, 0.226, z);
        const fork = new THREE.Group();
        fork.position.set(x, 0, z);
        attitude.add(fork);
        for (const dz of [-0.05, 0.05]) {
          box(machineAlu, 0.13, 0.1, 0.014, 0, 0.115, dz, fork);
        }
        addWheel(0, 0, fork);
        assemblyForward(fork, sx);
        // Drive and steer motors standing on the module plate.
        cylinder(dark, 0.034, 0.075, x - sx * 0.05, 0.245, z + sz * 0.045, attitude, 12);
        cylinder(aluminium, 0.026, 0.02, x - sx * 0.05, 0.288, z + sz * 0.045, attitude, 10);
        cylinder(dark, 0.03, 0.06, x + sx * 0.045, 0.245, z - sz * 0.045, attitude, 10);
      }
    }
  } else {
    // Tank / mecanum base: side rails, three wheels a side on a dropped
    // centre, chain guards and two motors lying along each rail.
    for (const sz of [-1, 1]) {
      box(machineAlu, frameL * 0.94, 0.016, 0.2, 0, 0.185, sz * (frameW / 2 - 0.1));
      box(machineAlu, frameL * 0.94, 0.05, 0.02, 0, 0.11, sz * (frameW / 2 - 0.05));
      for (const dx of [-0.32, 0, 0.32]) {
        const fork = new THREE.Group();
        fork.position.set(dx * frameL, 0, sz * (frameW / 2 - 0.04));
        attitude.add(fork);
        addWheel(0, 0, fork);
      }
      box(dark, frameL * 0.5, 0.06, 0.03, 0, 0.155, sz * (frameW / 2 - 0.015));
      const motor = cylinder(dark, 0.032, 0.09, -frameL * 0.2, 0.2, sz * (frameW / 2 - 0.15), attitude, 12);
      motor.rotation.z = Math.PI / 2;
      const motor2 = cylinder(machineAlu, 0.03, 0.08, -frameL * 0.06, 0.2, sz * (frameW / 2 - 0.15), attitude, 12);
      motor2.rotation.z = Math.PI / 2;
    }
    box(black, 0.3, 0.02, frameW - 0.05, 0, 0.09, 0);
  }

  // Bumpers: 4.5 in of covered foam reaching from ~1.25 in to 5.75 in off the
  // carpet, on a hard backer. This band is the most recognisable part of an
  // FRC robot, so it gets the number and the stitched hems.
  const bumperTex = makeBumperTexture(config.teamNumber, alliance, config.name);
  disposables.push(bumperTex);
  const bumperFaceMat = new THREE.MeshStandardMaterial({ map: bumperTex, roughness: 0.88, metalness: 0.02 });
  disposables.push(bumperFaceMat);
  const bumperThick = 0.058;
  const bumperH = 0.114;
  const bumperY = 0.089;
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
  // Battery brick, power distribution hub, roboRIO, radio and the motor
  // controllers, all low in the frame with the battery leads running to them.
  box(black, 0.2, 0.13, 0.16, -0.16, 0.2, frameW * 0.22);
  box(mat('#2a2f38', { metalness: 0.4 }), 0.204, 0.02, 0.164, -0.16, 0.27, frameW * 0.22, attitude);
  box(mat('#b03a2c', { roughness: 0.7 }), 0.02, 0.02, 0.03, -0.05, 0.24, frameW * 0.22);
  strut(mat('#b03a2c', { roughness: 0.7 }), -0.06, 0.25, frameW * 0.22, 0.02, 0.19, frameW * 0.1, 0.012);
  strut(black, -0.06, 0.22, frameW * 0.25, 0.04, 0.17, frameW * 0.12, 0.012);
  box(mat('#1d232b', { metalness: 0.45 }), 0.09, 0.05, 0.17, 0.02, 0.19, -frameW * 0.24);
  box(mat('#8a939e', { metalness: 0.7, roughness: 0.35 }), 0.07, 0.06, 0.12, 0.12, 0.185, -frameW * 0.18);
  box(dark, 0.05, 0.045, 0.09, -0.02, 0.185, frameW * 0.02);
  // CAN and power loom, bundled with a zip tie or two.
  strut(black, 0.02, 0.165, -frameW * 0.18, 0.2, 0.165, -frameW * 0.3, 0.012);
  strut(black, -0.16, 0.24, frameW * 0.3, 0.24, 0.17, frameW * 0.34, 0.013);
  box(mat('#2e7d8f', { roughness: 0.7 }), 0.02, 0.02, 0.02, 0.1, 0.17, frameW * 0.06);

  // ------------------------------------------------------------------ intake
  const intakeGroup = new THREE.Group();
  attitude.add(intakeGroup);
  let intakeRoller: THREE.Mesh | null = null;
  if (config.intake.enabled) {
    const width = Math.min(W * 0.82, config.intake.width);
    const reach = L / 2 + 0.14;
    // Pivoting side plates in polycarbonate, roller on compliant wheels.
    for (const sz of [-1, 1]) {
      const plate = box(panelMat, 0.3, 0.17, 0.008, L / 2 + 0.06, 0.085, sz * (width / 2 + 0.008), intakeGroup);
      plate.rotation.z = -0.12;
    }
    box(dark, 0.06, 0.05, width + 0.03, L / 2 + 0.02, 0.135, 0, intakeGroup);
    const rollerGeoTmp = geo(new THREE.CylinderGeometry(0.032, 0.032, width, 12));
    intakeRoller = new THREE.Mesh(rollerGeoTmp, mat('#1f242b', { roughness: 0.8 }));
    intakeRoller.rotation.x = Math.PI / 2;
    intakeRoller.position.set(reach, 0.05, 0);
    intakeRoller.castShadow = true;
    intakeGroup.add(intakeRoller);
    // Compliant wheels across the roller face.
    const compliantMat = mat('#e8a13c', { roughness: 0.78 });
    const compliantGeo = geo(new THREE.CylinderGeometry(0.038, 0.038, 0.055, 12));
    for (const i of [-1.5, -0.5, 0.5, 1.5]) {
      const wheel = new THREE.Mesh(compliantGeo, compliantMat);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(reach, 0.06, (i / 2) * (width / 2));
      intakeGroup.add(wheel);
    }
    box(accentMat, 0.02, 0.1, 0.05, reach + 0.02, 0.11, width / 2 + 0.02, intakeGroup);
    box(accentMat, 0.02, 0.1, 0.05, reach + 0.02, 0.11, -width / 2 - 0.02, intakeGroup);
    // Linkage back to the pivot.
    for (const sz of [-1, 1]) {
      strut(machineAlu, L / 2 + 0.02, 0.15, sz * (width / 2), reach - 0.04, 0.1, sz * (width / 2), 0.016, intakeGroup);
    }
  }

  // ------------------------------------------------------------------- hopper
  // Polycarbonate box with a net back wall: the 2026 robots store FUEL low and
  // wide, so the hopper is the biggest shape above the frame.
  const hopperFloor = 0.3;
  const hopperTop = 0.5;
  box(black, frameL * 0.86, 0.012, frameW * 0.84, 0, hopperFloor, 0);
  for (const sz of [-1, 1]) {
    box(panelMat, frameL * 0.84, hopperTop - hopperFloor, 0.008, 0, (hopperTop + hopperFloor) / 2, sz * (frameW / 2 - 0.02));
  }
  box(panelMat, 0.008, hopperTop - hopperFloor, frameW * 0.84, -frameL / 2 + 0.02, (hopperTop + hopperFloor) / 2, 0);
  const netPlane = new THREE.Mesh(geo(new THREE.PlaneGeometry(frameW * 0.8, hopperTop - hopperFloor)), netMat);
  netPlane.position.set(-frameL / 2 + 0.03, (hopperTop + hopperFloor) / 2, 0);
  netPlane.rotation.y = Math.PI / 2;
  attitude.add(netPlane);
  // Tension cables over the net, as teams run them to keep FUEL in.
  for (const sz of [-1, 1]) {
    strut(black, -frameL / 2 + 0.02, hopperTop + 0.02, sz * frameW * 0.3, -frameL * 0.2, hopperTop + 0.05, sz * frameW * 0.34, 0.008);
  }
  // Team plate above the bumper on both flanks.
  const sidePlateGeo = geo(new THREE.PlaneGeometry(0.3, 0.1));
  for (const sz of [-1, 1]) {
    const plate = new THREE.Mesh(sidePlateGeo, primaryMat);
    plate.position.set(0, 0.38, sz * (frameW / 2 - 0.012));
    plate.rotation.y = sz > 0 ? 0 : Math.PI;
    attitude.add(plate);
    box(accentMat, 0.3, 0.008, 0.006, 0, 0.335, sz * (frameW / 2 - 0.012));
  }

  // Skin pattern on the hopper side panels.
  if (config.skin.pattern === 'stripes') {
    for (const sz of [-1, 1]) {
      for (const dx of [-0.1, 0.02, 0.14]) {
        box(accentMat, 0.05, hopperTop - hopperFloor - 0.02, 0.01, dx, (hopperTop + hopperFloor) / 2, sz * (frameW / 2 - 0.014));
      }
    }
  } else if (config.skin.pattern === 'checker') {
    for (const sz of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        box(i % 2 === 0 ? accentMat : primaryMat, 0.07, 0.07, 0.01, -0.12 + i * 0.08, hopperTop - 0.06, sz * (frameW / 2 - 0.014));
      }
    }
  } else if (config.skin.pattern === 'hex') {
    const hexGeo = geo(new THREE.CylinderGeometry(0.05, 0.05, 0.01, 6));
    for (const sz of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const hex = new THREE.Mesh(hexGeo, accentMat);
        hex.rotation.x = Math.PI / 2;
        hex.position.set(-0.1 + i * 0.1, hopperTop - 0.07, sz * (frameW / 2 - 0.014));
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
    shooterGroup.position.set(0.02, hopperTop + 0.045, 0);
    shooterGroup.rotation.z = 0.3;
    box(dark, 0.24, 0.045, frameW * 0.72, 0, 0, 0, shooterGroup);
    for (const sz of [-1, 1]) {
      box(aluminium, 0.24, 0.1, 0.012, 0, 0.03, sz * frameW * 0.35, shooterGroup);
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
  }

  // ------------------------------------------------------------------ climber
  // Rear elevator/climber: box-tube mast, carriage and a hook for the TOWER
  // rungs. It doubles as the arm mechanism when the config asks for one.
  const armGroup = new THREE.Group();
  attitude.add(armGroup);
  // Keep the deployed machine inside the 30 in (0.762 m) height limit.
  const climbHeight = Math.min(0.3, 0.17 + config.climber.maxLevel * 0.045 + (config.arm.enabled ? 0.03 : 0));
  if (config.climber.enabled || config.arm.enabled) {
    const mastX = -frameL / 2 + 0.055;
    for (const sz of [-1, 1]) {
      box(aluminium, 0.04, climbHeight, 0.04, mastX, H + climbHeight / 2, sz * 0.09, armGroup);
    }
    box(machineAlu, 0.035, 0.035, 0.24, mastX, H + climbHeight, 0, armGroup);
    const carriage = box(secondaryMat, 0.06, 0.08, 0.22, mastX + 0.03, H + 0.12, 0, armGroup);
    void carriage;
    if (config.climber.enabled) {
      const hook = new THREE.Mesh(
        geo(new THREE.TorusGeometry(0.06, 0.014, 8, 16, Math.PI * 1.35)),
        accentMat,
      );
      hook.rotation.y = Math.PI / 2;
      hook.position.set(mastX, H + climbHeight + 0.05, 0);
      armGroup.add(hook);
      // Winch drum and cable at the base of the mast.
      const winch = cylinder(dark, 0.045, 0.12, mastX, H + 0.05, 0, armGroup, 12);
      winch.rotation.x = Math.PI / 2;
      strut(black, mastX, H + climbHeight - 0.02, 0, mastX + 0.01, H + 0.08, 0, 0.008, armGroup);
    }
    if (config.arm.enabled && config.arm.style === 'arm') {
      const shoulder = new THREE.Group();
      shoulder.position.set(mastX, H + 0.1, 0);
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
  const carryMat = mat('#f6c631', { roughness: 0.86, metalness: 0.02, emissive: '#3f3000', emissiveIntensity: 0.2 });
  const carrySlots: Array<[number, number, number]> = [];
  for (let layer = 0; layer < 2; layer++) {
    for (let ix = -1; ix <= 1; ix++) {
      for (let iz = -1; iz <= 1; iz++) {
        carrySlots.push([ix * 0.155, hopperFloor + 0.08 + layer * 0.145, iz * 0.15]);
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
    emissiveIntensity: 0,
  });
  disposables.push(beaconMat);
  const beacon = new THREE.Mesh(geo(new THREE.SphereGeometry(0.03, 8, 8)), beaconMat);
  beacon.position.set(-frameL / 2 + 0.06, hopperTop + 0.04, frameW * 0.34);
  attitude.add(beacon);

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
      wheelAngle += (speed / 0.051) * dt;
      for (const wheel of wheels) wheel.rotation.y = wheelAngle;
      if (drum) drum.rotation.y += (state.carrying > 0 ? 26 : 6) * dt;
      if (intakeRoller) intakeRoller.rotation.y -= 9 * dt * (state.intakeActive ? 2.4 : 0.5);

      if (config.arm.enabled) {
        const targetX = state.expanded ? 0.12 : 0.34;
        armGroup.position.x += (targetX - armGroup.position.x) * 0.15;
      }
      if (config.intake.enabled) {
        const targetX = state.expanded ? 0.06 : 0;
        intakeGroup.position.x += (targetX - intakeGroup.position.x) * 0.2;
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
        beaconMat.emissiveIntensity = 0;
        ledMat.color.set('#ffc83d');
      } else {
        ringMat.color.copy(red ? ALLIANCE_RED : ALLIANCE_BLUE);
        ringMat.opacity = 0.5;
        beaconMat.emissiveIntensity = 0;
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
