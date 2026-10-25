import { useCallback, useEffect, useRef, useState } from 'react';
import {
  MatchEngine,
  type DriverInput,
  type HumanInput,
  type MatchResults,
  type MatchSetup,
  type MatchSnapshot,
  type RefCommand,
  type RuleEvent,
} from '@rebuilt/shared';
import { buildLocalSetup, type LocalSetupOptions } from './matchSetup';
import { saveLocalMatch, downloadJson } from './storage';
import { useToast } from './toast';

export interface LocalRefResult {
  ok: boolean;
  message: string;
  event?: RuleEvent;
}

export function useLocalMatch() {
  const { push } = useToast();
  const [setup, setSetup] = useState<MatchSetup | null>(null);
  const [snapshot, setSnapshot] = useState<MatchSnapshot | null>(null);
  const [results, setResults] = useState<MatchResults | null>(null);
  const [running, setRunning] = useState(false);
  const [lastOptions, setLastOptions] = useState<LocalSetupOptions | null>(null);
  const engineRef = useRef<MatchEngine | null>(null);
  const rafRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const lastRenderRef = useRef(0);
  const savedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      engineRef.current = null;
    };
  }, []);

  const loop = useCallback(() => {
    const engine = engineRef.current;
    if (!engine || !mountedRef.current) return;
    let last = performance.now();
    const tick = (now: number) => {
      if (!engineRef.current || !mountedRef.current) return;
      // Feed the engine the real elapsed time. Capping at 50 ms used to make
      // the whole match run in slow motion whenever the renderer dropped below
      // 20 fps, which made the controls feel dead on weaker machines.
      const dt = Math.min(0.4, Math.max(0, (now - last) / 1000));
      last = now;
      engineRef.current.step(dt);
      if (now - lastRenderRef.current > 50 || engineRef.current.state.status === 'finished') {
        lastRenderRef.current = now;
        setSnapshot(engineRef.current.snapshot());
      }
      if (engineRef.current.state.status === 'finished') {
        const finalResults = engineRef.current.state.results;
        if (finalResults && !savedRef.current) {
          savedRef.current = true;
          setResults(finalResults);
          setRunning(false);
          saveLocalMatch(finalResults, finalResults.mode);
          push(`${finalResults.summary}`, finalResults.winner === 'tie' ? 'info' : 'success', 7000);
        }
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [push]);

  const start = useCallback(
    (options: LocalSetupOptions) => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      const builtSetup = buildLocalSetup(options);
      const engine = new MatchEngine(builtSetup);
      engineRef.current = engine;
      if (import.meta.env.DEV) {
        // Handy for tuning physics from the devtools console.
        (window as unknown as Record<string, unknown>).__rebuiltEngine = engine;
      }
      savedRef.current = false;
      lastRenderRef.current = 0;
      setLastOptions(options);
      setSetup(builtSetup);
      setSnapshot(engine.snapshot());
      setResults(null);
      setRunning(true);
      loop();
    },
    [loop],
  );

  const rematch = useCallback(() => {
    if (!lastOptions) return;
    start({ ...lastOptions, seed: Math.floor(Math.random() * 0xffffffff) });
  }, [lastOptions, start]);

  const stop = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    engineRef.current = null;
    setRunning(false);
    setSetup(null);
    setSnapshot(null);
    setResults(null);
  }, []);

  const setInput = useCallback((robotId: string, input: DriverInput) => {
    engineRef.current?.setInput(robotId, input);
  }, []);

  const setHumanInput = useCallback((alliance: 'red' | 'blue', input: HumanInput) => {
    engineRef.current?.setHumanInput(alliance, input);
  }, []);

  const refCommand = useCallback(
    (command: RefCommand): LocalRefResult => {
      const engine = engineRef.current;
      if (!engine) return { ok: false, message: 'No match is running.' };
      const result = engine.applyRefCommand(command);
      setSnapshot(engine.snapshot());
      if (result.ok) push(result.message, 'info');
      else push(result.message, 'warning');
      if (engine.state.status === 'finished' && engine.state.results && !savedRef.current) {
        savedRef.current = true;
        setResults(engine.state.results);
        setRunning(false);
        saveLocalMatch(engine.state.results, engine.state.results.mode);
      }
      return result;
    },
    [push],
  );

  const exportLog = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    downloadJson(`rebuilt-match-${engine.setup.id}.json`, engine.exportMatchLog());
  }, []);

  return {
    setup,
    snapshot,
    results,
    running,
    lastOptions,
    start,
    rematch,
    stop,
    setInput,
    setHumanInput,
    refCommand,
    exportLog,
    humanRobotId: 'robot-0',
  };
}
