import { ArrowRight, Fingerprint, ShieldCheck, Navigation2 } from 'lucide-react';
import { useIdentity } from './IdentityProvider';
import { useAppRouter } from '../../app/router';
const names: Record<string, string> = {
  '/motion': 'FLOW Motion',
  '/wallet': 'Portofel FLOW',
  '/profile': 'FLOW Passport',
  '/navigation': 'Navigație',
  '/challenges': 'Provocările tale',
  '/community': 'Comunitate',
  '/city': 'FLOW City',
};
export function AuthGateway() {
  const id = useIdentity(),
    { location } = useAppRouter();
  return (
    <section className="identity-gateway">
      <div className="identity-gateway-copy">
        <span className="flow-eyebrow">
          FLOW IDENTITY · {names[location.pathname] ?? 'EXPERIENȚA TA'}
        </span>
        <div className="identity-mark">
          <Navigation2 size={34} />
        </div>
        <h1>
          Continuă
          <br />
          în <em>FLOW.</em>
        </h1>
        <p>Creează-ți un cont și păstrează-ți progresul, monedele și experiența personalizată.</p>
        {id.loading ? (
          <p role="status">Verificăm sesiunea în siguranță…</p>
        ) : (
          <>
            {id.error && (
              <p className="identity-alert" role="alert">
                {id.error}
              </p>
            )}
            {id.expired && (
              <p role="status">Sesiunea a expirat. Drumul tău este păstrat pentru reconectare.</p>
            )}
            <div className="identity-actions">
              <button
                className="identity-primary"
                disabled={!!id.error?.includes('nu este configurată')}
                onClick={() => void id.login()}
              >
                Conectează-te <ArrowRight size={18} />
              </button>
              <button className="identity-secondary" onClick={() => void id.login(true)}>
                Creează cont
              </button>
            </div>
          </>
        )}
        <small>Drumul tău continuă de aici.</small>
        <a href="/" className="identity-back">
          Înapoi la explorare
        </a>
      </div>
      <aside className="identity-gateway-aside">
        <span className="identity-passport-label">VLAIQ / PERSONAL MOBILITY</span>
        <h2>
          Orașul tău.
          <br />
          Identitatea ta.
          <br />
          Călătoria ta.
        </h2>
        <div className="identity-orbit">
          <Navigation2 size={74} />
        </div>
        <div className="identity-trust">
          <ShieldCheck />
          <p>
            <strong>Un singur cont. Progresul tău.</strong>Identitatea este verificată de Auth0.
            Datele FLOW rămân legate de cont.
          </p>
        </div>
        <div className="identity-trust">
          <Fingerprint />
          <p>
            <strong>Intră în ritmul tău.</strong>Google, parolă sau Passkey, când este disponibil pe
            contul și dispozitivul tău.
          </p>
        </div>
      </aside>
    </section>
  );
}
