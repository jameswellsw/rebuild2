import * as THREE from 'three';
import type { RobotConfig, RobotSnapshot } from '@rebuilt/shared';
import { makeNumberTexture } from './textures';

export interface RobotVisual {
  group: THREE.Group;
  update: (state: RobotSnapshot, time: number) => void;
  setHighlight: (active: boolean) => void;
  dispose: () => void;
}

const ALLIANCE_RED = new THREE.Color('#ff4356');
const ALLIANCE_BLUE = new THREE.Color('#3f8bff');

/**
 * A robot assembled from the same component choices as the physics config.
 * Forward is +X so the field renderer can use rotation.y = -heading.
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
  const numberColor = new THREE.Color(config.skin.numberColor);
  const disposables: Array<THREE.BufferGeometry | THREE.Material | THREE.Texture> = [];

  const mat = (
    color: THREE.ColorRepresentation,
    options: Partial<THREE.MeshStandardMaterialParameters> = {},
  ): THREE.MeshStandardMaterial => {
    const m = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.52,
      metalness: 0.18,
      ...options,
    });
    disposables.push(m);
    return m;
  };
  const geo = (geometry: THREE.BufferGeometry): THREE.BufferGeometry => {
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

  const dark = mat('#14181f', { metalness: 0.55, roughness: 0.4 });
  const aluminium = mat('#aeb7c2', { metalness: 0.85, roughness: 0.28 });
  const rubber = mat('#131313', { roughness: 0.9, metalness: 0.03 });
  const primaryMat = mat(primary, { roughness: 0.42 });
  const secondaryMat = mat(secondary, { roughness: 0.55 });
  const accentMat = mat(accent, { metalness: 0.35, roughness: 0.32, emissive: accent.clone().multiplyScalar(0.12) });
  const bumperColor = alliance === 'red' ? '#c8102e' : '#0057b8';
  const bumperMat = mat(bumperColor, { roughness: 0.48 });
  const numberMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  disposables.push(numberMat);

  // Chassis and wheels.
  box(dark, L - 0.08, H, W - 0.07, 0, H / 2 + 0.07, 0);
  box(primaryMat, L * 0.72, 0.035, W * 0.72, 0.015, H + 0.09, 0);
  const wheelGeo = geo(new THREE.CylinderGeometry(0.092, 0.092, 0.065, 14));
  const hubGeo = geo(new THREE.CylinderGeometry(0.045, 0.045, 0.07, 12));
  const wheelPositions: Array<[number, number]> = [
    [L * 0.31, W / 2 - 0.015],
    [-L * 0.31, W / 2 - 0.015],
    [L * 0.31, -W / 2 + 0.015],
    [-L * 0.31, -W / 2 + 0.015],
  ];
  for (const [x, z] of wheelPositions) {
    const wheel = new THREE.Mesh(wheelGeo, rubber);
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(x, 0.1, z);
    wheel.castShadow = true;
    attitude.add(wheel);
    const hub = new THREE.Mesh(hubGeo, accentMat);
    hub.rotation.x = Math.PI / 2;
    hub.position.set(x, 0.1, z + Math.sign(z) * 0.038);
    attitude.add(hub);
  }

  // Bumpers: the visible perimeter used by the rules. Alliance color is
  // mandatory in FRC, so it wins over the cosmetic skin.
  const bumperY = 0.17;
  box(bumperMat, 0.075, 0.16, W + 0.06, L / 2 + 0.02, bumperY, 0);
  box(bumperMat, 0.075, 0.16, W + 0.06, -L / 2 - 0.02, bumperY, 0);
  box(bumperMat, L + 0.06, 0.16, 0.075, 0, bumperY, W / 2 + 0.02);
  box(bumperMat, L + 0.06, 0.16, 0.075, 0, bumperY, -W / 2 - 0.02);
  box(secondaryMat, L + 0.02, 0.035, W + 0.02, 0, 0.28, 0);

  // Team number decals on the bumpers.
  const numberTex = makeNumberTexture(config.teamNumber, bumperColor, '#ffffff');
  disposables.push(numberTex);
  numberMat.map = numberTex;
  const numberPlane = geo(new THREE.PlaneGeometry(0.36, 0.12));
  for (const [x, z, rot] of [
    [L / 2 + 0.06, 0, Math.PI / 2],
    [-L / 2 - 0.06, 0, -Math.PI / 2],
    [0, W / 2 + 0.064, 0],
    [0, -W / 2 - 0.064, Math.PI],
  ] as Array<[number, number, number]>) {
    const plane = new THREE.Mesh(numberPlane, numberMat);
    plane.position.set(x, bumperY, z);
    plane.rotation.y = rot;
    attitude.add(plane);
  }

  // Skin pattern overlays.
  if (config.skin.pattern === 'stripes') {
    box(accentMat, L * 0.62, 0.012, 0.075, 0.02, H + 0.115, -W * 0.18);
    box(accentMat, L * 0.62, 0.012, 0.075, 0.02, H + 0.115, W * 0.18);
  } else if (config.skin.pattern === 'checker') {
    for (let i = 0; i < 4; i++) {
      box(accentMat, 0.1, 0.012, 0.1, -L * 0.22 + i * 0.14, H + 0.115, (i % 2 === 0 ? -1 : 1) * W * 0.16);
    }
  } else if (config.skin.pattern === 'hex') {
    const hexGeo = geo(new THREE.CylinderGeometry(0.075, 0.075, 0.014, 6));
    for (let i = 0; i < 3; i++) {
      const hex = new THREE.Mesh(hexGeo, accentMat);
      hex.position.set(-L * 0.22 + i * 0.16, H + 0.115, 0);
      attitude.add(hex);
    }
  }

  // Intake.
  const intakeGroup = new THREE.Group();
  attitude.add(intakeGroup);
  if (config.intake.enabled) {
    const width = Math.min(W * 0.78, config.intake.width);
    box(secondaryMat, 0.14, 0.09, width, L / 2 + 0.1, 0.13, 0, intakeGroup);
    const roller = new THREE.Mesh(
      geo(new THREE.CylinderGeometry(0.055, 0.055, width, 12)),
      mat('#f2c94c', { roughness: 0.7 }),
    );
    roller.rotation.x = Math.PI / 2;
    roller.position.set(L / 2 + 0.17, 0.13, 0);
    intakeGroup.add(roller);
    box(accentMat, 0.03, 0.14, 0.06, L / 2 + 0.18, 0.2, width / 2 - 0.02, intakeGroup);
    box(accentMat, 0.03, 0.14, 0.06, L / 2 + 0.18, 0.2, -width / 2 + 0.02, intakeGroup);
  }

  // Shooter / launcher.
  if (config.shooter.enabled) {
    const shooter = new THREE.Group();
    shooter.position.set(-0.02, H + 0.16, 0);
    attitude.add(shooter);
    box(dark, 0.3, 0.09, W * 0.46, 0, 0, 0, shooter);
    const barrel = new THREE.Mesh(
      geo(new THREE.CylinderGeometry(0.07, 0.082, 0.4, 14)),
      secondaryMat,
    );
    barrel.rotation.z = Math.PI / 2;
    barrel.rotation.x = 0;
    barrel.position.set(0.22, 0.06, 0);
    barrel.castShadow = true;
    shooter.add(barrel);
    const rim = new THREE.Mesh(
      geo(new THREE.TorusGeometry(0.075, 0.014, 8, 14)),
      accentMat,
    );
    rim.rotation.y = Math.PI / 2;
    rim.position.set(0.43, 0.06, 0);
    shooter.add(rim);
    const flywheelGeo = geo(new THREE.CylinderGeometry(0.075, 0.075, 0.035, 14));
    for (const z of [-W * 0.17, W * 0.17]) {
      const wheel = new THREE.Mesh(flywheelGeo, accentMat);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(0.13, 0.08, z);
      shooter.add(wheel);
    }
    shooter.rotation.z = 0.16;
  }

  // Climber / tower hook.
  const climberGroup = new THREE.Group();
  attitude.add(climberGroup);
  if (config.climber.enabled) {
    const height = 0.5 + config.climber.maxLevel * 0.12;
    box(aluminium, 0.035, height, 0.035, -L / 2 + 0.05, H + height / 2, W * 0.25, climberGroup);
    box(aluminium, 0.035, height, 0.035, -L / 2 + 0.05, H + height / 2, -W * 0.25, climberGroup);
    box(aluminium, 0.035, 0.035, W * 0.54, -L / 2 + 0.05, H + height, 0, climberGroup);
    const hook = new THREE.Mesh(
      geo(new THREE.TorusGeometry(0.075, 0.02, 8, 14, Math.PI * 1.3)),
      accentMat,
    );
    hook.rotation.y = Math.PI / 2;
    hook.position.set(-L / 2 + 0.05, H + height + 0.06, 0);
    climberGroup.add(hook);
  }

  // Arm / elevator.
  const armGroup = new THREE.Group();
  attitude.add(armGroup);
  if (config.arm.enabled) {
    const pivot = new THREE.Group();
    pivot.position.set(-0.06, H + 0.08, 0);
    armGroup.add(pivot);
    box(dark, 0.14, 0.14, W * 0.4, 0, 0, 0, pivot);
    const segmentLength = Math.max(0.2, config.arm.reach + 0.35);
    const arm = box(aluminium, segmentLength, 0.075, W * 0.34, segmentLength / 2 - 0.03, 0.02, 0, pivot);
    arm.castShadow = true;
    box(accentMat, 0.048, 0.08, W * 0.36, segmentLength - 0.06, 0.02, 0, pivot);
    if (config.arm.style === 'elevator') {
      pivot.rotation.z = Math.PI / 2.4;
    } else {
      pivot.rotation.z = 0.1;
    }
    armGroup.userData.segmentLength = segmentLength;
  }

  // Sensors.
  if (config.sensors.fuelDetector || config.sensors.autoAlign) {
    box(dark, 0.06, 0.07, 0.14, L / 2 - 0.02, H + 0.12, 0);
    const lens = new THREE.Mesh(
      geo(new THREE.SphereGeometry(0.025, 10, 8)),
      mat('#59e3ff', { emissive: '#147e94', emissiveIntensity: 1.4, metalness: 0.2 }),
    );
    lens.position.set(L / 2 + 0.02, H + 0.13, 0);
    attitude.add(lens);
  }

  // Carry indicator.
  const carryGroup = new THREE.Group();
  attitude.add(carryGroup);
  const carryGeo = geo(new THREE.SphereGeometry(0.045, 8, 8));
  const carryMat = mat('#ffd43b', { emissive: '#806000', emissiveIntensity: 0.55, roughness: 0.55 });
  for (let i = 0; i < 6; i++) {
    const ball = new THREE.Mesh(carryGeo, carryMat);
    ball.position.set(-L / 2 + 0.12 + (i % 3) * 0.09, H + 0.3 + Math.floor(i / 3) * 0.075, W * 0.16);
    ball.visible = false;
    carryGroup.add(ball);
  }

  // Status ring and disabled beacon.
  const ringMat = new THREE.MeshBasicMaterial({
    color: alliance === 'red' ? ALLIANCE_RED : ALLIANCE_BLUE,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
  });
  disposables.push(ringMat);
  const ring = new THREE.Mesh(geo(new THREE.TorusGeometry(0.52, 0.012, 6, 40)), ringMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.018;
  group.add(ring);

  const beaconMat = new THREE.MeshStandardMaterial({
    color: '#2b0707',
    emissive: '#ff2b2b',
    emissiveIntensity: 0,
  });
  disposables.push(beaconMat);
  const beacon = new THREE.Mesh(geo(new THREE.SphereGeometry(0.035, 8, 8)), beaconMat);
  beacon.position.set(-L / 2 + 0.04, H + 0.2, 0);
  attitude.add(beacon);

  const highlightMat = new THREE.MeshBasicMaterial({
    color: '#ffcf3f',
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const highlight = new THREE.Mesh(geo(new THREE.TorusGeometry(0.66, 0.022, 8, 48)), highlightMat);
  highlight.rotation.x = Math.PI / 2;
  highlight.position.y = 0.026;
  group.add(highlight);

  const baseWheelRotation = wheelPositions.map(() => 0);

  return {
    group,
    update(state: RobotSnapshot, time: number) {
      attitude.position.y = 0;
      attitude.rotation.z = state.tipped ? Math.PI / 2.1 : 0;
      attitude.rotation.x = state.tipped ? 0.18 : 0;
      if (state.tipped) attitude.position.y = 0.38;
      const climbBoost = state.climb.level * 0.42 + (state.climb.active ? 0.08 : 0);
      attitude.position.y += climbBoost;
      if (state.climb.active) {
        attitude.rotation.z += Math.sin(time * 9) * 0.012;
      }
      if (config.arm.enabled) {
        const segment = Number(armGroup.userData.segmentLength ?? 0.5);
        const targetX = state.expanded ? Math.max(0, segment - 0.3) : 0;
        armGroup.children[0].position.x += (targetX - armGroup.children[0].position.x) * 0.2;
      }
      if (config.intake.enabled) {
        const targetX = state.expanded ? 0.08 : 0;
        intakeGroup.position.x += (targetX - intakeGroup.position.x) * 0.2;
      }
      carryGroup.children.forEach((child, i) => {
        child.visible = i < Math.min(state.carrying, 6);
      });
      if (state.disabled || state.disqualified) {
        beaconMat.emissiveIntensity = 2.4 * (0.4 + 0.6 * Math.abs(Math.sin(time * 3)));
        ringMat.color.set('#ff3040');
        ringMat.opacity = 0.35;
      } else if (state.pinned) {
        ringMat.color.set('#ffc83d');
        ringMat.opacity = 0.9;
        beaconMat.emissiveIntensity = 0;
      } else {
        ringMat.color.copy(alliance === 'red' ? ALLIANCE_RED : ALLIANCE_BLUE);
        ringMat.opacity = 0.55;
        beaconMat.emissiveIntensity = 0;
      }
      if (state.climb.level > 0) {
        ringMat.opacity = 0.85;
      }
      void baseWheelRotation;
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
