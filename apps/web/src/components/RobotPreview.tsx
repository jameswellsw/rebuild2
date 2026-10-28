import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { RobotConfig, RobotSnapshot } from '@rebuilt/shared';
import { createRobotModel, type RobotVisual } from '../three/robotModel';

interface RobotPreviewProps {
  config: RobotConfig;
  alliance?: 'red' | 'blue';
  className?: string;
}

function dummyState(config: RobotConfig): RobotSnapshot {
  return {
    id: 'preview',
    slot: 0,
    x: 0,
    y: 0,
    heading: 0,
    turretYaw: 0,
    vx: 0,
    vy: 0,
    carrying: config.intake.capacity,
    intakeActive: false,
    expanded: config.arm.enabled ? false : false,
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
}

/**
 * Turntable preview used by the Bot Lab. The scene and camera live for the
 * lifetime of the panel; only the robot model is rebuilt when a part changes.
 */
export function RobotPreview({ config, alliance = 'red', className }: RobotPreviewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const robotRef = useRef<RobotVisual | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch (error) {
      console.error('[bot-lab] WebGL unavailable', error);
      setFailed(true);
      return;
    }
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 50);
    camera.position.set(2.2, 1.6, 2.4);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0.42, 0);
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 1.8;
    controls.maxDistance = 5.5;
    controls.minPolarAngle = 0.5;
    controls.maxPolarAngle = 1.48;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.7;
    controls.update();

    scene.add(new THREE.HemisphereLight('#dbe8ff', '#1b2029', 1.55));
    const key = new THREE.DirectionalLight('#ffffff', 3.1);
    key.position.set(2.6, 4.4, 2.2);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 12;
    key.shadow.camera.left = -2.4;
    key.shadow.camera.right = 2.4;
    key.shadow.camera.top = 2.4;
    key.shadow.camera.bottom = -2.4;
    scene.add(key);
    const rim = new THREE.DirectionalLight(alliance === 'red' ? '#ff6a76' : '#67a0ff', 2.2);
    rim.position.set(-3, 1.8, -2.4);
    scene.add(rim);
    const glow = new THREE.PointLight('#d9e6ff', 6, 6, 2);
    glow.position.set(0, 2.6, 0);
    scene.add(glow);

    const platform = new THREE.Mesh(
      new THREE.CylinderGeometry(1.18, 1.24, 0.06, 64),
      new THREE.MeshStandardMaterial({ color: '#1a212b', roughness: 0.68, metalness: 0.3 }),
    );
    platform.receiveShadow = true;
    platform.position.y = -0.03;
    scene.add(platform);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.22, 0.012, 8, 96),
      new THREE.MeshBasicMaterial({
        color: alliance === 'red' ? '#ff4356' : '#3f8bff',
        transparent: true,
        opacity: 0.75,
      }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.002;
    scene.add(ring);
    const grid = new THREE.GridHelper(2.4, 12, '#2a3543', '#222b36');
    grid.position.y = 0.001;
    scene.add(grid);

    const resize = () => {
      const width = host.clientWidth || 320;
      const height = host.clientHeight || 320;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(host);

    let frame = 0;
    const animate = (now: number) => {
      frame = requestAnimationFrame(animate);
      controls.update();
      if (robotRef.current) {
        robotRef.current.group.rotation.y = 0;
        // A slow mechanical bob makes the preview feel alive without hiding parts.
        robotRef.current.update(dummyState(config), now / 1000);
      }
      renderer.render(scene, camera);
    };
    frame = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      robotRef.current?.dispose();
      robotRef.current = null;
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const material = object.material;
          if (Array.isArray(material)) material.forEach((m) => m.dispose());
          else material.dispose();
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
      sceneRef.current = null;
    };
    // Camera and stage are static; alliance only tints the rim light.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alliance]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    if (robotRef.current) {
      scene.remove(robotRef.current.group);
      robotRef.current.dispose();
    }
    const visual = createRobotModel(config, alliance);
    robotRef.current = visual;
    visual.group.scale.setScalar(1.9);
    visual.group.position.y = 0.02;
    scene.add(visual.group);
    return () => {
      scene.remove(visual.group);
      visual.dispose();
      if (robotRef.current === visual) robotRef.current = null;
    };
  }, [config, alliance]);

  return (
    <div className={`robot-preview-host ${className ?? ''}`} ref={hostRef}>
      {failed && (
        <div className="webgl-fallback small">
          <strong>3D preview unavailable.</strong>
          <span>The robot still works on the field.</span>
        </div>
      )}
      <div className="preview-hint">
        <span>DRAG TO ORBIT</span>
        <span>SCROLL TO ZOOM</span>
      </div>
    </div>
  );
}
