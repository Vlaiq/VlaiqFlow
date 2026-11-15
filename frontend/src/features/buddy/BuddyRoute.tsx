import { useIdentity } from '../identity/IdentityProvider';
import { AuthGateway } from '../identity/AuthGateway';
import { useAppRouter } from '../../app/router';
import { accountBuddy } from './accountClient';
import { BuddyScreen } from './BuddyScreen';
import { BuddyJourney } from './BuddyJourney';
import { referenceFromSearch } from '../journey/journeyHandoff';
export function BuddyRoute({ onWalletChange }: { onWalletChange(balance: number): void }) {
  const id = useIdentity(),
    { navigate, location } = useAppRouter();
  if (!id.authenticated) return <AuthGateway />;
  if (new URLSearchParams(location.search).has('journey')) {
    try {
      const reference = referenceFromSearch(location.search);
      return <BuddyJourney key={`${id.accountKey}:${reference.id}:${reference.revision}`} reference={reference} />;
    } catch {
      return <div className="flow-page"><p role="alert">Referința comparației este invalidă. Recalculează drumul.</p><a href="/">Înapoi la hartă</a></div>;
    }
  }
  if (id.profileLoading)
    return (
      <div className="flow-page" role="status">
        Pregătim spațiul tău Buddy…
      </div>
    );
  if (!id.profile)
    return (
      <div className="flow-page">
        <p role="alert">{id.error ?? 'Profilul nu este disponibil.'}</p>
        <button onClick={() => void id.reload()}>Reîncearcă</button>
      </div>
    );
  return (
    <BuddyScreen
      identity={{ issuer: `https://${import.meta.env.VITE_AUTH0_DOMAIN}/`, subject: id.accountKey }}
      client={accountBuddy}
      onBack={() => navigate('/challenges')}
      onNavigate={() => navigate('/')}
      onWalletChange={(balance) => {
        onWalletChange(balance);
        window.dispatchEvent(new Event('flow-buddy-wallet-committed'));
      }}
    />
  );
}
