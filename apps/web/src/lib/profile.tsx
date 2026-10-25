import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

interface Profile {
  userId: string;
  name: string;
}

interface ProfileContextValue {
  profile: Profile;
  setName: (name: string) => void;
  regenerate: () => void;
}

const STORAGE_KEY = 'rebuilt-arena.profile.v1';
const ProfileContext = createContext<ProfileContextValue | null>(null);

function randomSuffix(): string {
  return String(Math.floor(100 + Math.random() * 900));
}

function freshProfile(): Profile {
  const suffix = randomSuffix();
  return {
    userId: `driver-${crypto.randomUUID()}`,
    name: `Driver ${suffix}`,
  };
}

function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Profile>;
      if (parsed.userId && parsed.name) return { userId: parsed.userId, name: parsed.name };
    }
  } catch {
    // Ignore corrupt storage and create a fresh anonymous identity.
  }
  return freshProfile();
}

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile>(() => loadProfile());

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    } catch {
      // Storage can be unavailable in private browsing; the session still works.
    }
  }, [profile]);

  const setName = useCallback((name: string) => {
    const clean = name.replace(/[<>]/g, '').trim().slice(0, 32);
    if (!clean) return;
    setProfile((p) => ({ ...p, name: clean }));
  }, []);

  const regenerate = useCallback(() => {
    setProfile(freshProfile());
  }, []);

  const value = useMemo(() => ({ profile, setName, regenerate }), [profile, setName, regenerate]);
  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile(): ProfileContextValue {
  const context = useContext(ProfileContext);
  if (!context) throw new Error('useProfile must be used inside ProfileProvider');
  return context;
}
