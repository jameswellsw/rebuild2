import { useCallback, useEffect, useMemo, useState } from 'react';
import { BUILTIN_FIELDS, type FieldLayout } from '@rebuilt/shared';
import { api, ApiError } from './api';
import { useProfile } from './profile';
import { loadLocalFields, saveLocalField, type LocalField } from './storage';

export interface FieldOption {
  id: string;
  name: string;
  layout: FieldLayout;
  custom: boolean;
  ownerId?: string;
}

export function useFields() {
  const { profile } = useProfile();
  const [serverFields, setServerFields] = useState<FieldOption[]>([]);
  const [localFields, setLocalFields] = useState<LocalField[]>(() => loadLocalFields());
  const [offline, setOffline] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const { fields } = await api.fields();
      setServerFields(fields);
      setOffline(false);
    } catch (err) {
      setOffline(true);
      void err;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const fields = useMemo<FieldOption[]>(() => {
    const map = new Map<string, FieldOption>();
    // The regulation carpet and the Championship staging both ship with the app.
    for (const builtin of BUILTIN_FIELDS) {
      map.set(builtin.id, { id: builtin.id, name: builtin.name, layout: builtin, custom: false });
    }
    for (const field of serverFields) map.set(field.id, field);
    for (const field of localFields) map.set(field.id, field);
    return [...map.values()];
  }, [localFields, serverFields]);

  const saveField = useCallback(
    async (input: { id?: string; name: string; layout: FieldLayout }): Promise<{ field: FieldOption; synced: boolean }> => {
      const id = input.id && !BUILTIN_FIELDS.some((builtin) => builtin.id === input.id) ? input.id : `field-${crypto.randomUUID()}`;
      const layout: FieldLayout = {
        ...JSON.parse(JSON.stringify(input.layout)),
        id,
        name: input.name,
        custom: true,
      };
      const local: LocalField = {
        id,
        name: input.name,
        layout,
        custom: true,
        updatedAt: new Date().toISOString(),
      };
      saveLocalField(local);
      setLocalFields(loadLocalFields());
      try {
        const { field } = await api.saveField(profile.userId, {
          id,
          name: input.name,
          layout,
          playerName: profile.name,
        });
        const saved: FieldOption = { id: field.id, name: field.name, layout: field.layout, custom: true };
        saveLocalField({ ...saved, updatedAt: new Date().toISOString() });
        setLocalFields(loadLocalFields());
        setServerFields((list) => [saved, ...list.filter((f) => f.id !== saved.id)]);
        setOffline(false);
        return { field: saved, synced: true };
      } catch (err) {
        setOffline(true);
        if (err instanceof ApiError && err.status >= 400) throw err;
        return { field: local, synced: false };
      }
    },
    [profile.name, profile.userId],
  );

  return { fields, loading, offline, refresh, saveField };
}
