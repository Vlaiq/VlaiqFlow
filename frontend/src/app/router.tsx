import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

interface Location {
  pathname: string;
  search: string;
}
const read = (): Location => ({
  pathname: window.location.pathname.replace(/\/+$/, '') || '/',
  search: window.location.search,
});
const RouterContext = createContext<{
  location: Location;
  navigate: (href: string, replace?: boolean) => void;
} | null>(null);
export function AppRouter({ children }: { children: ReactNode }) {
  const [location, setLocation] = useState(read);
  const navigate = useCallback((href: string, replace = false) => {
    const url = new URL(href, window.location.origin);
    if (url.origin !== window.location.origin) {
      window.location.assign(url);
      return;
    }
    if (replace) window.history.replaceState(null, '', url);
    else window.history.pushState(null, '', url);
    setLocation(read());
  }, []);
  useEffect(() => {
    const pop = () => setLocation(read());
    window.addEventListener('popstate', pop);
    return () => window.removeEventListener('popstate', pop);
  }, []);
  const value = useMemo(() => ({ location, navigate }), [location, navigate]);
  return (
    <RouterContext.Provider value={value}>
      <div
        className="app-router"
        onClick={(event) => {
          if (
            event.defaultPrevented ||
            event.button !== 0 ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey
          )
            return;
          const anchor = (event.target as HTMLElement).closest<HTMLAnchorElement>('a[href]');
          if (!anchor || anchor.target || anchor.hasAttribute('download')) return;
          const url = new URL(anchor.href);
          if (
            url.origin !== window.location.origin ||
            (url.hash &&
              url.pathname === window.location.pathname &&
              url.search === window.location.search)
          )
            return;
          event.preventDefault();
          navigate(url.pathname + url.search + url.hash);
        }}
      >
        {children}
      </div>
    </RouterContext.Provider>
  );
}
export function useAppRouter() {
  const router = useContext(RouterContext);
  if (!router) throw new Error('AppRouter required');
  return router;
}
