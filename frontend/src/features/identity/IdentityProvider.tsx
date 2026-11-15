import { Auth0Provider, useAuth0 } from '@auth0/auth0-react';
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Profile, type ProfileInput } from '../../../../shared/src/identity';
import { safeReturnTo } from './redirects';
import { accountCall, privateFetch, API_BASE, setTokenGetter } from './privateApi';
import { useAppRouter } from '../../app/router';
import './identity.css';

interface IdentityContextValue {
  authenticated: boolean;
  loading: boolean;
  expired: boolean;
  profile: Profile | null;
  avatar: string | null;
  accountKey: string;
  error: string | null;
  profileLoading: boolean;
  emailVerified: boolean | undefined;
  login: (signup?: boolean, reauthenticate?: boolean) => Promise<void>;
  logout: () => Promise<void>;
  reload: () => Promise<void>;
  save: (value: ProfileInput) => Promise<void>;
  upload: (file: Blob | null) => Promise<void>;
  erase: () => Promise<void>;
}
const IdentityContext = createContext<IdentityContextValue | null>(null);
const unavailable = async () => {
  throw new Error('Conectează-te pentru a continua.');
};
const guest: IdentityContextValue = {
  authenticated: false,
  loading: false,
  expired: false,
  profile: null,
  avatar: null,
  accountKey: 'guest',
  error: null,
  profileLoading: false,
  emailVerified: undefined,
  login: unavailable,
  logout: unavailable,
  reload: unavailable,
  save: unavailable,
  upload: unavailable,
  erase: unavailable,
};
export const useIdentity = () => useContext(IdentityContext) ?? guest;
function configuration() {
  const e = import.meta.env;
  const domain = e.VITE_AUTH0_DOMAIN,
    clientId = e.VITE_AUTH0_CLIENT_ID,
    audience = e.VITE_AUTH0_AUDIENCE;
  if (!domain || !/^[a-zA-Z0-9.-]+$/.test(domain) || !clientId || !audience) return null;
  const redirect = e.VITE_AUTH0_REDIRECT_URI ?? window.location.origin + '/';
  const logout = e.VITE_AUTH0_LOGOUT_URI ?? window.location.origin + '/';
  if (
    new URL(redirect).origin !== window.location.origin ||
    new URL(logout).origin !== window.location.origin
  )
    return null;
  return { domain, clientId, audience, redirect, logout };
}
export function IdentityProvider({ children }: { children: ReactNode }) {
  const { navigate } = useAppRouter();
  let cfg: ReturnType<typeof configuration> = null;
  try {
    cfg = configuration();
  } catch {
    /* Explicit configuration state below. */
  }
  if (!cfg)
    return (
      <IdentityContext.Provider
        value={{
          ...guest,
          login: async () => navigate('/profile'),
          error:
            'La această adresă autentificarea nu este configurată. Verifică domeniul și URL-urile Auth0.',
        }}
      >
        {children}
      </IdentityContext.Provider>
    );
  return (
    <Auth0Provider
      domain={cfg.domain}
      clientId={cfg.clientId}
      cacheLocation="memory"
      authorizationParams={{
        redirect_uri: cfg.redirect,
        audience: cfg.audience,
        scope: 'openid profile email',
        ui_locales: 'ro',
      }}
      onRedirectCallback={(state) => {
        const target = safeReturnTo(state?.returnTo, window.location.origin);
        try {
          sessionStorage.removeItem('flow-login-return');
        } catch {}
        navigate(target, true);
      }}
    >
      <IdentityRuntime logoutUri={cfg.logout}>{children}</IdentityRuntime>
    </Auth0Provider>
  );
}
function IdentityRuntime({ children, logoutUri }: { children: ReactNode; logoutUri: string }) {
  const auth = useAuth0();
  const { location, navigate } = useAppRouter();
  const [profile, setProfile] = useState<Profile | null>(null),
    [avatar, setAvatar] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null),
    [profileLoading, setProfileLoading] = useState(false),
    [expired, setExpired] = useState(false);
  const accountKey = auth.isAuthenticated ? (auth.user?.sub ?? 'pending') : 'guest';
  const current = useRef(accountKey);
  current.current = accountKey;
  const avatarUrl = useRef<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const channel = useRef<BroadcastChannel | null>(null);
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const c = new BroadcastChannel('flow-identity');
    channel.current = c;
    c.onmessage = (e) => {
      if (e.data === 'logout') {
        setTokenGetter(null);
        setExpired(true);
        setProfile(null);
        clearAvatar();
      }
    };
    return () => {
      c.close();
      channel.current = null;
    };
  }, []);
  const clearAvatar = () => {
    if (avatarUrl.current) URL.revokeObjectURL(avatarUrl.current);
    avatarUrl.current = null;
    setAvatar(null);
  };
  useLayoutEffect(() => {
    setTokenGetter(
      auth.isAuthenticated && !expired
        ? async () => {
            const token = await auth.getAccessTokenSilently();
            if (!token) throw new Error('Missing access token');
            return token;
          }
        : null,
    );
    return () => setTokenGetter(null);
  }, [accountKey, auth.isAuthenticated, auth.getAccessTokenSilently, expired]);
  useEffect(() => {
    const onExpiry = () => {
      setExpired(true);
      setProfile(null);
      clearAvatar();
    };
    window.addEventListener('flow-session-expired', onExpiry);
    return () => window.removeEventListener('flow-session-expired', onExpiry);
  }, []);
  useEffect(() => {
    let alive = true;
    setProfile(null);
    clearAvatar();
    setError(null);
    if (!auth.isAuthenticated || expired) {
      setProfileLoading(false);
      return;
    }
    setProfileLoading(true);
    void accountCall('/me')
      .then((data) => {
        if (alive) {
          setProfile(Profile.parse(data));
          setLoadedFor(accountKey);
        }
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : 'Profil indisponibil.');
      })
      .finally(() => {
        if (alive) setProfileLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [accountKey, auth.isAuthenticated, revision, expired]);
  useEffect(() => {
    let alive = true;
    clearAvatar();
    if (!profile?.avatarVersion || loadedFor !== accountKey) return;
    void privateFetch(`${API_BASE}/api/me/avatar`)
      .then(async (r) => {
        if (!r.ok) throw new Error();
        return r.blob();
      })
      .then((blob) => {
        if (alive) {
          const url = URL.createObjectURL(blob);
          avatarUrl.current = url;
          setAvatar(url);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
      clearAvatar();
    };
  }, [accountKey, profile?.avatarVersion, loadedFor]);
  // An Auth0 cancellation can land on / with no appState callback. Restore only a safe saved path.
  useEffect(() => {
    if (auth.error) {
      let saved: string | null = null;
      try {
        saved = sessionStorage.getItem('flow-login-return');
      } catch {}
      if (saved) {
        sessionStorage.removeItem('flow-login-return');
        navigate(safeReturnTo(saved, window.location.origin), true);
      }
    }
  }, [auth.error, navigate]);
  const login = async (signup = false, reauthenticate = false) => {
    if (!window.dispatchEvent(new Event('flow-before-navigate', { cancelable: true }))) return;
    setError(null);
    const returnTo = safeReturnTo(
      location.pathname + location.search + window.location.hash,
      window.location.origin,
    );
    try {
      try {
        sessionStorage.setItem('flow-login-return', returnTo);
      } catch {}
      await auth.loginWithRedirect({
        appState: { returnTo },
        authorizationParams: {
          ...(signup ? { screen_hint: 'signup' } : {}),
          ...(reauthenticate ? { prompt: 'login', max_age: 0 } : {}),
        },
      });
    } catch {
      setError('Conectarea nu a putut începe. Verifică internetul și reîncearcă.');
    }
  };
  const logout = async () => {
    if (!window.dispatchEvent(new Event('flow-before-navigate', { cancelable: true }))) return;
    channel.current?.postMessage('logout');
    setTokenGetter(null);
    setProfile(null);
    clearAvatar();
    setExpired(true);
    try {
      for (const key of ['vlaiq.parkedCar.v1', 'vlaiq.favourites.v1']) localStorage.removeItem(key);
    } catch {}
    try {
      sessionStorage.removeItem('flow-login-return');
      // The FLOW Voice conversation of this tab belongs to the account that signs out.
      sessionStorage.removeItem('vlaiq-voice-transcript');
    } catch {}
    await auth.logout({ logoutParams: { returnTo: logoutUri } });
  };
  const update = async (fn: () => Promise<unknown>) => {
    const key = accountKey;
    const value = Profile.parse(await fn());
    if (current.current === key) {
      setProfile(value);
      setLoadedFor(key);
    }
  };
  const value: IdentityContextValue = {
    authenticated: auth.isAuthenticated && !expired,
    loading: auth.isLoading,
    expired,
    profile: loadedFor === accountKey ? profile : null,
    avatar: loadedFor === accountKey ? avatar : null,
    accountKey,
    error:
      error ??
      (auth.error
        ? 'Autentificarea a fost anulată sau nu s-a încheiat. Poți încerca din nou.'
        : null),
    profileLoading: profileLoading || (auth.isAuthenticated && loadedFor !== accountKey && !error),
    emailVerified: auth.user?.email_verified,
    login,
    logout,
    reload: async () => {
      setRevision((v) => v + 1);
    },
    save: (input) =>
      update(() =>
        accountCall('/me', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        }),
      ),
    upload: (file) =>
      update(() =>
        accountCall(
          '/me/avatar',
          file
            ? {
                method: 'PUT',
                headers: { 'Content-Type': file.type },
                body: file,
              }
            : { method: 'DELETE' },
        ),
      ),
    erase: async () => {
      await accountCall('/me', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: 'DELETE' }),
      });
      await logout();
    },
  };
  return (
    <IdentityContext.Provider value={value}>
      <div key={`${accountKey}:${expired}`} className="identity-root">
        {children}
      </div>
    </IdentityContext.Provider>
  );
}
