import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type Theme = 'dark' | 'light';
export const THEME_STORAGE_KEY = 'vlaiq.theme';
export function resolveTheme(preference: string | null, systemDark: boolean): Theme {
  return preference === 'light' || preference === 'dark'
    ? preference
    : systemDark
      ? 'dark'
      : 'light';
}
function savedPreference(): Theme | null {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    return value === 'dark' || value === 'light' ? value : null;
  } catch {
    return null;
  }
}
function systemDark() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}
interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  useSystemTheme: () => void;
}
const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<Theme | null>(() =>
    typeof window === 'undefined' ? null : savedPreference(),
  );
  const [system, setSystem] = useState(systemDark);
  const theme = resolveTheme(preference, system);
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    document
      .querySelector<HTMLMetaElement>('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'dark' ? '#0b1510' : '#f6f8f3');
  }, [theme]);
  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const change = () => setSystem(query.matches);
    const storage = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY) setPreference(savedPreference());
    };
    query.addEventListener('change', change);
    window.addEventListener('storage', storage);
    return () => {
      query.removeEventListener('change', change);
      window.removeEventListener('storage', storage);
    };
  }, []);
  const setTheme = useCallback((value: Theme) => {
    setPreference(value);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, value);
    } catch {
      /* Private storage can be unavailable. */
    }
  }, []);
  const toggleTheme = useCallback(
    () => setTheme(theme === 'dark' ? 'light' : 'dark'),
    [setTheme, theme],
  );
  const useSystemTheme = useCallback(() => {
    setPreference(null);
    try {
      window.localStorage.removeItem(THEME_STORAGE_KEY);
    } catch {
      /* The in-memory choice still works. */
    }
  }, []);
  const value = useMemo(
    () => ({ theme, setTheme, toggleTheme, useSystemTheme }),
    [theme, setTheme, toggleTheme, useSystemTheme],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme requires ThemeProvider');
  return value;
}
