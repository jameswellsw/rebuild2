import {
  PRESET_BOTS,
  cloneField,
  type Alliance,
  type FieldLayout,
  type MatchMode,
  type MatchSetup,
  type RobotConfig,
} from '@rebuilt/shared';

export interface LocalSetupOptions {
  mode: MatchMode;
  field: FieldLayout;
  playerBot: RobotConfig;
  playerName: string;
  playerAlliance?: Alliance;
  seed?: number;
}

const RED_AI = ['preset-valkyrie', 'preset-nova', 'preset-ironclad'];
const BLUE_AI = ['preset-riptide', 'preset-quicksilver', 'preset-atlas'];

function botFor(id: string): RobotConfig {
  const preset = PRESET_BOTS.find((b) => b.id === id) ?? PRESET_BOTS[0];
  const config: RobotConfig = JSON.parse(JSON.stringify(preset.config));
  config.name = preset.name;
  config.teamNumber = preset.teamNumber;
  return config;
}

/**
 * Build a complete offline match. The human always occupies their alliance's
 * first slot; the rest of the mode is filled with preset AI robots.
 */
export function buildLocalSetup(options: LocalSetupOptions): MatchSetup {
  const count = options.mode === '1v1' ? 1 : options.mode === '2v2' ? 2 : 3;
  const humanAlliance: Alliance = options.playerAlliance ?? 'red';
  const robots: MatchSetup['robots'] = [];
  const seed = options.seed ?? Math.floor(Math.random() * 0xffffffff);

  for (const alliance of ['red', 'blue'] as Alliance[]) {
    for (let index = 0; index < count; index++) {
      const isHuman = alliance === humanAlliance && index === 0;
      const config = isHuman
        ? { ...JSON.parse(JSON.stringify(options.playerBot)), name: options.playerBot.name, teamNumber: options.playerBot.teamNumber }
        : botFor((alliance === 'red' ? RED_AI : BLUE_AI)[index] ?? PRESET_BOTS[index]?.id ?? 'preset-atlas');
      robots.push({
        id: `robot-${alliance === 'red' ? index : 3 + index}`,
        slot: alliance === 'red' ? index : 3 + index,
        alliance,
        index,
        teamNumber: config.teamNumber,
        teamName: config.name.toUpperCase().slice(0, 18),
        bot: config,
        controller: isHuman ? 'human' : 'ai',
        displayName: isHuman ? options.playerName : 'AI',
      });
    }
  }

  return {
    id: `local-${crypto.randomUUID()}`,
    seed,
    gameId: 'rebuilt2026',
    field: cloneField(options.field),
    mode: options.mode,
    robots,
    humans: [
      { alliance: 'red', controller: 'ai', displayName: 'Red HP (AI)' },
      { alliance: 'blue', controller: 'ai', displayName: 'Blue HP (AI)' },
    ],
    autoEnforcement: true,
    judgmentPolicy: 'auto',
  };
}
