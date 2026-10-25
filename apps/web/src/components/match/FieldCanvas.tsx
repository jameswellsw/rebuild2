import { useEffect, useRef, useState } from 'react';
import type { MatchSetup, MatchSnapshot } from '@rebuilt/shared';
import { FieldScene, type CameraMode } from '../../three/fieldScene';

interface FieldCanvasProps {
  setup: MatchSetup;
  snapshot: MatchSnapshot;
  cameraMode: CameraMode;
  focusRobotId?: string;
  playerRobotId?: string;
  quality?: 'high' | 'balanced';
}

export function FieldCanvas({
  setup,
  snapshot,
  cameraMode,
  focusRobotId,
  playerRobotId,
  quality = 'high',
}: FieldCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<FieldScene | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;
    let scene: FieldScene | null = null;
    try {
      scene = new FieldScene(containerRef.current, {
        field: setup.field,
        setup,
        focusRobotId,
        playerRobotId,
        cameraMode,
        quality,
      });
      scene.update(snapshot);
      sceneRef.current = scene;
      setFailed(false);
    } catch (error) {
      console.error('[field] unable to start WebGL renderer', error);
      setFailed(true);
    }
    return () => {
      scene?.dispose();
      sceneRef.current = null;
    };
    // The scene is rebuilt only for a new match/field.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setup.id, setup.field.id, playerRobotId, quality]);

  useEffect(() => {
    sceneRef.current?.update(snapshot);
  }, [snapshot]);

  useEffect(() => {
    sceneRef.current?.setCameraMode(cameraMode);
  }, [cameraMode]);

  useEffect(() => {
    sceneRef.current?.setFocusRobot(focusRobotId);
  }, [focusRobotId]);

  return (
    <div className="field-canvas-host" ref={containerRef}>
      {failed && (
        <div className="webgl-fallback">
          <span className="eyebrow">Rendering offline</span>
          <h2>This browser could not start WebGL.</h2>
          <p>Try a current Chrome, Edge or Safari build with hardware acceleration enabled. The match simulation is still running.</p>
        </div>
      )}
    </div>
  );
}
