import { useCallback, useEffect, useMemo, useState } from 'react';
import { PRESET_BOTS, normalizeRobotConfig, validateRobot, type BotRecord, type RobotConfig } from '@rebuilt/shared';
import { api, ApiError } from './api';
import { useProfile } from './profile';
import { deleteLocalBot, loadLocalBots, mergeBots, saveLocalBot } from './storage';

export interface SaveBotInput {
  id?: string;
  name: string;
  teamNumber: number;
  description: string;
  config: RobotConfig;
}

export interface SaveBotResult {
  bot: BotRecord;
  synced: boolean;
}

export function useBots() {
  const { profile } = useProfile();
  const [serverBots, setServerBots] = useState<BotRecord[]>([]);
  const [localBots, setLocalBots] = useState<BotRecord[]>(() => loadLocalBots());
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const { bots } = await api.bots(profile.userId);
      setServerBots(bots);
      setOffline(false);
      setError(null);
    } catch (err) {
      setOffline(true);
      setError(err instanceof ApiError ? err.message : 'Bot library is unavailable.');
    } finally {
      setLoading(false);
    }
  }, [profile.userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const bots = useMemo(() => mergeBots(PRESET_BOTS, localBots, serverBots), [localBots, serverBots]);

  const saveBot = useCallback(
    async (input: SaveBotInput): Promise<SaveBotResult> => {
      const id = input.id ?? `bot-${crypto.randomUUID()}`;
      const config = normalizeRobotConfig(
        { ...input.config, name: input.name, teamNumber: input.teamNumber },
        id,
      );
      const validation = validateRobot(config);
      if (!validation.valid) throw new Error(validation.errors.join(' '));
      const now = new Date().toISOString();
      const bot: BotRecord = {
        id,
        name: input.name.trim(),
        teamNumber: input.teamNumber,
        description: input.description.trim(),
        config,
        ownerId: profile.userId,
        preset: false,
        createdAt: now,
        updatedAt: now,
      };
      saveLocalBot(bot);
      setLocalBots(loadLocalBots());
      try {
        const { bot: synced } = await api.saveBot(profile.userId, {
          id: input.id,
          name: bot.name,
          teamNumber: bot.teamNumber,
          description: bot.description,
          config,
          playerName: profile.name,
        });
        saveLocalBot(synced);
        setLocalBots(loadLocalBots());
        setServerBots((list) => [synced, ...list.filter((b) => b.id !== synced.id)]);
        setOffline(false);
        return { bot: synced, synced: true };
      } catch (err) {
        setOffline(true);
        if (err instanceof ApiError && err.status >= 400) throw err;
        return { bot, synced: false };
      }
    },
    [profile.name, profile.userId],
  );

  const removeBot = useCallback(
    async (id: string) => {
      deleteLocalBot(id);
      setLocalBots(loadLocalBots());
      if (!id.startsWith('bot-')) return;
      try {
        await api.deleteBot(profile.userId, id);
        setServerBots((list) => list.filter((b) => b.id !== id));
      } catch {
        setOffline(true);
      }
    },
    [profile.userId],
  );

  return { bots, loading, offline, error, refresh, saveBot, removeBot };
}
