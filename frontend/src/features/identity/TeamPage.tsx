import { useEffect, useState } from 'react';
import {
  ArrowUpRight,
  Code2,
  Leaf,
  MapPin,
  Mic,
  Navigation2,
  Pencil,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { DEFAULT_TEAM, TeamPresentation } from '../../../../shared/src/identity';
import { useIdentity } from './IdentityProvider';
import { accountCall, API_BASE } from './privateApi';
export function TeamPage() {
  const identity = useIdentity(),
    [team, setTeam] = useState(DEFAULT_TEAM as ReturnType<typeof TeamPresentation.parse>),
    [canEdit, setCanEdit] = useState(false),
    [accessSource, setAccessSource] = useState('auth0-permissions'),
    [editing, setEditing] = useState(false),
    [error, setError] = useState(''),
    [success, setSuccess] = useState(''),
    [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState(team);
  useEffect(() => {
    let alive = true;
    void fetch(`${API_BASE}/api/team`)
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((data) => {
        if (alive) {
          setTeam(TeamPresentation.parse(data));
          setDraft(TeamPresentation.parse(data));
        }
      })
      .catch(() => {
        /* The checked-in authentic presentation remains available without the database. */
      });
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    let alive = true;
    setCanEdit(false);
    if (identity.authenticated)
      void accountCall('/team/access')
        .then((access) => {
          if (alive) {
            setCanEdit(true);
            setAccessSource(access.source);
          }
        })
        .catch(() => {});
    return () => {
      alive = false;
    };
  }, [identity.authenticated, identity.accountKey]);
  const save = async () => {
    setError('');
    setBusy(true);
    try {
      const result = TeamPresentation.parse(
        await accountCall('/team', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(draft),
        }),
      );
      setTeam(result);
      setEditing(false);
      setSuccess('Prezentare salvată.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Salvarea nu a reușit.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flow-page team-page">
      <div className="passport-kicker">
        <span className="flow-eyebrow">MEET TEAM VLAIQ</span>
        <span>TIMIȘOARA · UNIHACK 2026</span>
      </div>
      <section className="team-hero">
        <div>
          <span className="flow-eyebrow">O ECHIPĂ. MAI MULTE DRUMURI.</span>
          <h1>{team.headline}</h1>
          <p>{team.story}</p>
          <a className="identity-primary" href="/">
            Descoperă FLOW <ArrowUpRight size={17} />
          </a>
        </div>
        <div className="team-photo">
          {team.photoUrl ? (
            <img src={team.photoUrl} alt="Echipa VLAIQ la UniHack 2026" />
          ) : (
            <>
              <div className="team-photo-brand">
                <Navigation2 size={70} />
                <strong>
                  VLAIQ<span>FLOW</span>
                </strong>
              </div>
              <p>Locul nostru în poveste.</p>
              <small>Fotografia autentică a echipei va apărea aici.</small>
            </>
          )}
        </div>
      </section>
      {success && (
        <p className="identity-success" role="status">
          {success}
        </p>
      )}
      {canEdit && (
        <button className="identity-secondary" onClick={() => setEditing(!editing)}>
          <Pencil size={16} />
          {editing ? 'Închide editarea' : 'Editează prezentarea echipei'}
        </button>
      )}
      {editing && (
        <form
          className="passport-card identity-form"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <h2>Prezentarea echipei</h2>
          <label>
            Titlu
            <input
              maxLength={120}
              required
              value={draft.headline}
              onChange={(e) => setDraft({ ...draft, headline: e.target.value })}
            />
          </label>
          <label>
            Poveste
            <textarea
              maxLength={2000}
              required
              rows={6}
              value={draft.story}
              onChange={(e) => setDraft({ ...draft, story: e.target.value })}
            />
          </label>
          <label>
            Fotografie autentică din /team/
            <input
              placeholder="/team/vlaiq.webp"
              value={draft.photoUrl}
              onChange={(e) => setDraft({ ...draft, photoUrl: e.target.value })}
            />
          </label>
          <p>
            Fișierul foto și lista membrilor se livrează prin repository. Editarea este limitată de
            backend la{' '}
            {accessSource === 'application-managed'
              ? 'un grant controlat de aplicație pentru'
              : 'permisiunea Auth0'}{' '}
            update:team-presentation.
          </p>
          {error && <p role="alert">{error}</p>}
          <button disabled={busy} className="identity-primary">
            {busy ? 'Salvăm…' : 'Salvează prezentarea'}
          </button>
        </form>
      )}
      {team.members.length > 0 && (
        <section className="team-members">
          {team.members.map((m) => (
            <article className="passport-card" key={m.name}>
              <Users />
              <h2>{m.name}</h2>
              <p>{m.responsibility}</p>
            </article>
          ))}
        </section>
      )}
      <div className="passport-heading">
        <div>
          <span className="flow-eyebrow">CONSTRUIT CU UN SCOP</span>
          <h2>Tehnologie care face loc orașului.</h2>
        </div>
      </div>
      <div className="team-integrations">
        {[
          {
            Icon: MapPin,
            title: 'Date care au o sursă.',
            text: 'SmartMatch și Timpark explică recomandările de parcare. MapLibre afișează harta; rutele provin de la furnizori reali.',
          },
          {
            Icon: ShieldCheck,
            title: 'Identitate care contează.',
            text: 'Auth0 protejează accesul, iar FLOW păstrează profilul și progresul legate de identitatea verificată.',
          },
          {
            Icon: Mic,
            title: 'Un copilot, la îndemână.',
            text: 'FLOW Voice conectează ElevenLabs la instrumentele reale de planificare și navigație.',
          },
          {
            Icon: Leaf,
            title: 'Mișcare, cu sens.',
            text: 'FLOW Motion evaluează activitățile GPS pe server. DEMO rămâne separat de portofelul real.',
          },
        ].map((c) => (
          <article className="passport-card" key={c.title}>
            <c.Icon size={26} />
            <h3>{c.title}</h3>
            <p>{c.text}</p>
          </article>
        ))}
      </div>
      <section className="passport-security">
        <Code2 size={28} />
        <div>
          <strong>De la un hackathon la o călătorie mai bună.</strong>
          <p>
            Un proiect studențesc pentru Green Mobility. Integrări explicate, limite vizibile și un
            oraș pus în centru.
          </p>
        </div>
        <a href="/help">
          Cum funcționează <ArrowUpRight size={16} />
        </a>
      </section>
    </div>
  );
}
