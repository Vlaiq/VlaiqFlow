// SYNTHETIC SDK for scripts/test-identity-browser.cjs only. Never imported by the app build.
import { createContext, useContext, useMemo, useState } from 'react';
const Context = createContext(null);
export function Auth0Provider({ children, onRedirectCallback }) {
  const [account, setAccount] = useState(window.identityFixture?.account ?? null);
  const state = useMemo(
    () => ({
      isAuthenticated: !!account,
      isLoading: false,
      error: undefined,
      user: account ? { sub: account.subject, email_verified: true } : undefined,
      getAccessTokenSilently: async () => {
        if (!account) throw new Error('login_required');
        return account.token;
      },
      loginWithRedirect: async (options) => {
        window.identityFixture.login = options;
      },
      logout: async () => {
        window.identityFixture.loggedOut = true;
        setAccount(null);
      },
    }),
    [account],
  );
  Object.assign(window.identityFixture, {
    switchAccount: (next) => {
      window.identityFixture.account = next;
      setAccount(next);
    },
    callback: (target) => onRedirectCallback({ returnTo: target }),
  });
  return <Context.Provider value={state}>{children}</Context.Provider>;
}
export function useAuth0() {
  return useContext(Context);
}
