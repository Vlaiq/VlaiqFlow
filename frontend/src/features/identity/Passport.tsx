import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  Bike,
  Camera,
  Check,
  Clock3,
  Footprints,
  Leaf,
  LockKeyhole,
  Pencil,
  ShieldCheck,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { z } from 'zod';
import { ProfileInput, VOICE_MEMORY_LINES, type Profile } from '../../../../shared/src/identity';
import { MotionEvaluation, MotionMode, MotionWallet, motionNames } from '@vlaiq/shared';
import { useIdentity } from './IdentityProvider';
import { Avatar } from './AccountMenu';
import { AvatarCropper } from './AvatarCropper';
import { accountCall } from './privateApi';
import { useAppRouter } from '../../app/router';
import { BuddyProgressCard } from '../buddy/BuddyProgressCard';
const Activities = z.array(
  z.object({
    id: z.string(),
    mode: MotionMode,
    startedAt: z.number(),
    state: z.string(),
    evaluation: MotionEvaluation.optional(),
  }),
);
type Records = z.infer<typeof Activities>;
const distance = (m: number) =>
  `${(m / 1000).toLocaleString('ro-RO', { maximumFractionDigits: 1 })} km`;
export function Passport({
  editing = false,
  activitiesOnly = false,
}: {
  editing?: boolean;
  activitiesOnly?: boolean;
}) {
  const id = useIdentity(),
    { navigate } = useAppRouter();
  const [wallet, setWallet] = useState<z.infer<typeof MotionWallet> | null>(null),
    [records, setRecords] = useState<Records>([]),
    [error, setError] = useState(''),
    [attempt, setAttempt] = useState(0),
    [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    setReady(false);
    setError('');
    void Promise.all([accountCall('/motion/wallet'), accountCall('/motion/activities')])
      .then(([w, a]) => {
        if (alive) {
          setWallet(MotionWallet.parse(w));
          setRecords(Activities.parse(a));
          setReady(true);
        }
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : 'Progres indisponibil.');
      });
    return () => {
      alive = false;
    };
  }, [id.accountKey, attempt]);
  if (id.profileLoading)
    return (
      <div className="flow-page" role="status">
        Pregătim pașaportul tău…
      </div>
    );
  if (!id.profile)
    return (
      <div className="flow-page identity-load-error">
        <ShieldCheck size={34} />
        <h1>Pașaportul tău este în siguranță.</h1>
        <p role="alert">{id.error ?? 'Profilul nu poate fi încărcat acum.'}</p>
        <button className="identity-primary" onClick={() => void id.reload()}>
          Încearcă din nou
        </button>
      </div>
    );
  if (editing) return <ProfileEditor profile={id.profile} />;
  const eligible = records.filter((a) => a.evaluation?.status === 'eligible');
  const meters = eligible.reduce((sum, a) => sum + (a.evaluation?.distance ?? 0), 0),
    seconds = eligible.reduce((sum, a) => sum + (a.evaluation?.seconds ?? 0), 0);
  return (
    <div className="flow-page passport-page">
      <div className="passport-kicker">
        <span className="flow-eyebrow">FLOW PASSPORT</span>
        <span>
          <ShieldCheck size={14} /> {id.mode === 'local' ? 'Profil pe acest dispozitiv, fără cont' : 'Identitate prin Auth0'}
        </span>
      </div>
      <section className="passport-hero">
        <div className="passport-person">
          <a
            href="/profile/edit"
            aria-label="Editează fotografia de profil"
            className="passport-avatar-link"
          >
            <Avatar large />
            <span>
              <Camera size={16} />
            </span>
          </a>
          <div>
            <span className="flow-eyebrow">BINE AI VENIT ÎN ORAȘUL TĂU</span>
            <h1>{id.profile.displayName}</h1>
            <p className="passport-nickname">@{id.profile.nickname}</p>
            {id.profile.biography && <p className="passport-bio">{id.profile.biography}</p>}
            <small>
              În FLOW din{' '}
              {new Date(id.profile.createdAt).toLocaleDateString('ro-RO', {
                month: 'long',
                year: 'numeric',
              })}
            </small>
          </div>
        </div>
        <a href="/profile/edit" className="identity-secondary">
          <Pencil size={16} /> Editează profilul
        </a>
      </section>
      <div className="passport-heading">
        <div>
          <span className="flow-eyebrow">FIECARE ALEGERE CONTEAZĂ</span>
          <h2>{activitiesOnly ? 'Activitățile mele.' : 'Drumul tău spre mai verde.'}</h2>
        </div>
        <span className="passport-data-note">Doar activități evaluate de server</span>
      </div>
      {error && (
        <div className="identity-alert" role="alert">
          {error} <button onClick={() => setAttempt((v) => v + 1)}>Reîncearcă</button>
        </div>
      )}
      <div className="passport-stats">
        {[
          ['FLOW Coins', wallet?.balance, Leaf, 'Portofel comun · mișcare și educație'],
          [
            'Activități eligibile',
            ready ? eligible.length : null,
            Footprints,
            'GPS plauzibil, evaluat pe server',
          ],
          ['Distanță validată', ready ? distance(meters) : null, Bike, 'Fără trasee GPS publice'],
          [
            'Timp activ',
            ready ? `${Math.round(seconds / 60)} min` : null,
            Clock3,
            'Din observații valide',
          ],
        ].map(([label, value, Icon, note]) => {
          const I = Icon as typeof Leaf;
          return (
            <article key={String(label)} className="passport-stat">
              <I size={20} />
              <span>{String(label)}</span>
              <strong>{value == null ? '—' : String(value)}</strong>
              <small>{String(note)}</small>
            </article>
          );
        })}
      </div>
      <div className="passport-grid">
        {!activitiesOnly && <BuddyProgressCard key={id.accountKey} />}
        <section className="passport-card passport-timeline">
          <div className="identity-section-heading">
            <h2>În mișcare, în ritmul tău.</h2>
            <Footprints size={20} />
          </div>
          {!ready && !error && <p role="status">Încărcăm activitățile…</p>}
          {ready && !records.length && (
            <div className="passport-empty">
              <div className="passport-empty-icon">
                <Leaf size={30} />
              </div>
              <h3>Prima călătorie începe cu tine.</h3>
              <p>
                Pornește o activitate Motion în aer liber. După evaluarea GPS, progresul eligibil
                apare aici.
              </p>
              <a href="/motion" className="identity-primary">
                Hai la mișcare <ArrowRight size={17} />
              </a>
            </div>
          )}
          {records.length > 0 && (
            <ol className="passport-activity-list">
              {records.slice(0, 30).map((a) => (
                <li key={a.id}>
                  <span className="passport-activity-icon">
                    {a.mode === 'cycle' ? <Bike size={20} /> : <Footprints size={20} />}
                  </span>
                  <div>
                    <strong>{motionNames[a.mode]}</strong>
                    <small>{new Date(a.startedAt).toLocaleString('ro-RO')}</small>
                    <span>
                      {a.evaluation
                        ? `${distance(a.evaluation.distance)} · ${Math.round(a.evaluation.seconds / 60)} min · ${a.evaluation.status === 'eligible' ? 'Eligibilă' : a.evaluation.status === 'rejected' ? 'Respinsă' : 'Nevalidată'}`
                        : a.state === 'recording'
                          ? 'Înregistrare în curs'
                          : 'Anulată'}
                    </span>
                  </div>
                  <b>
                    +{a.evaluation?.coins ?? 0}
                    <small>FLOW</small>
                  </b>
                </li>
              ))}
            </ol>
          )}
        </section>
        <aside className="passport-side">
          <section className="passport-card">
            <span className="flow-eyebrow">REPERELE TALE</span>
            <h2>Pași mici. Progres real.</h2>
            {[
              {
                label: 'Primul pas',
                description: 'O activitate eligibilă',
                done: eligible.length >= 1,
              },
              {
                label: 'Un nou obicei',
                description: '5 activități eligibile',
                done: eligible.length >= 5,
              },
              {
                label: 'Orașul, mai aproape',
                description: '10 km validați',
                done: meters >= 10000,
              },
            ].map((m) => (
              <div className={`passport-milestone ${m.done ? 'is-earned' : ''}`} key={m.label}>
                {m.done ? <Check size={18} /> : <LockKeyhole size={18} />}
                <div>
                  <strong>{m.label}</strong>
                  <small>{m.description}</small>
                </div>
                {m.done && <span>Atins</span>}
              </div>
            ))}
          </section>
          <section className="passport-card passport-preferences">
            <span className="flow-eyebrow">ALEGERI CARE TE REPREZINTĂ</span>
            <h2>Preferințele tale.</h2>
            <p>
              {
                {
                  balanced: 'Echilibru între cost și mers',
                  cheap: 'Prioritate pentru preț',
                  less_walk: 'Mai puțin mers pe jos',
                }[id.profile.preferences.mode]
              }
            </p>
            <p>Maximum {id.profile.preferences.maxWalkMinutes} minute de mers</p>
            <a href="/settings">
              Ajustează preferințele <ArrowUpRight size={16} />
            </a>
          </section>
        </aside>
      </div>
      <section className="passport-security">
        <ShieldCheck size={24} />
        <div>
          <strong>Contul tău. Alegerile tale.</strong>
          <p>
            Profilul și portofelul sunt private. Controlezi personalizarea vocală și datele
            păstrate.
          </p>
        </div>
        <a href="/settings">
          Setările contului <ArrowRight size={16} />
        </a>
      </section>
    </div>
  );
}
/** Forget what FLOW Voice remembers, without withdrawing consent. */
function ForgetVoiceMemory() {
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  return (
    <p className="identity-voice-memory">
      <button
        type="button"
        className="identity-secondary"
        disabled={state === 'busy'}
        onClick={() => {
          setState('busy');
          void accountCall('/me/voice-memory', { method: 'DELETE' }).then(
            () => {
              try {
                sessionStorage.removeItem('vlaiq-voice-transcript');
              } catch {}
              setState('done');
            },
            () => setState('error'),
          );
        }}
      >
        Șterge memoria FLOW Voice
      </button>
      <span role="status">
        {state === 'done'
          ? 'Memoria a fost ștearsă. Următoarea conversație începe de la zero.'
          : state === 'error'
            ? 'Nu am putut șterge memoria acum. Reîncearcă.'
            : ''}
      </span>
    </p>
  );
}
function ProfileEditor({ profile }: { profile: Profile }) {
  const id = useIdentity(),
    { navigate } = useAppRouter();
  const { avatarVersion, createdAt, updatedAt, ...editable } = profile;
  const initial = ProfileInput.parse(editable),
    [form, setForm] = useState(initial),
    [saved, setSaved] = useState(initial),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [success, setSuccess] = useState(''),
    [file, setFile] = useState<File | null>(null),
    [deleting, setDeleting] = useState(false);
  const input = useRef<HTMLInputElement>(null),
    dirty = JSON.stringify(form) !== JSON.stringify(saved);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  useEffect(() => {
    const unload = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    const navigate = (e: Event) => {
      if (dirtyRef.current && !window.confirm('Ai modificări nesalvate. Vrei să părăsești pagina?'))
        e.preventDefault();
    };
    window.addEventListener('beforeunload', unload);
    window.addEventListener('flow-before-navigate', navigate);
    return () => {
      window.removeEventListener('beforeunload', unload);
      window.removeEventListener('flow-before-navigate', navigate);
    };
  }, []);
  const save = async () => {
    setError('');
    setSuccess('');
    const result = ProfileInput.safeParse(form);
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? 'Verifică datele.');
      return;
    }
    setBusy(true);
    try {
      await id.save(result.data);
      setSaved(result.data);
      setForm(result.data);
      setSuccess('Profil salvat. Ne vedem în oraș!');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nu am putut salva.');
    } finally {
      setBusy(false);
    }
  };
  const pick = (f: File | undefined) => {
    if (!f) return;
    setError('');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(f.type) || f.size > 5 * 1024 * 1024) {
      setError('Alege JPEG, PNG sau WebP de cel mult 5 MB.');
      return;
    }
    setFile(f);
  };
  return (
    <div className="flow-page passport-edit-page">
      <a href="/profile" className="identity-back">
        ← Înapoi la pașaport
      </a>
      <span className="flow-eyebrow">FLOW IDENTITY</span>
      <h1>Fă-l al tău.</h1>
      <p className="identity-muted">Un profil care merge cu tine, pe fiecare dispozitiv.</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        className="passport-edit-grid"
      >
        <div>
          <section className="passport-card passport-photo">
            <button
              type="button"
              className="passport-avatar-link"
              aria-label="Încarcă o fotografie de profil"
              onClick={() => input.current?.click()}
            >
              <Avatar large />
              <span>
                <Camera size={17} />
              </span>
            </button>
            <div>
              <h2>Fotografia ta</h2>
              <p>JPEG, PNG sau WebP · maximum 5 MB</p>
              <input
                ref={input}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                aria-label="Alege fotografia"
                onChange={(e) => {
                  pick(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
              <div className="identity-actions">
                <button
                  className="identity-secondary"
                  type="button"
                  onClick={() => input.current?.click()}
                >
                  Alege o fotografie
                </button>
                {profile.avatarVersion && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setBusy(true);
                      void id
                        .upload(null)
                        .then(() => setSuccess('Fotografie eliminată.'))
                        .catch((e) => setError(e.message))
                        .finally(() => setBusy(false));
                    }}
                  >
                    Elimină
                  </button>
                )}
              </div>
            </div>
          </section>
          <section className="passport-card identity-form">
            <h2>Despre tine</h2>
            <label>
              Nume afișat
              <input
                required
                maxLength={80}
                autoComplete="name"
                value={form.displayName}
                onChange={(e) => setForm({ ...form, displayName: e.target.value })}
              />
            </label>
            <label>
              Nickname
              <input
                required
                maxLength={30}
                aria-label="Nickname"
                autoComplete="nickname"
                value={form.nickname}
                onChange={(e) => setForm({ ...form, nickname: e.target.value })}
              />
              <small>Apare în antet și, cu acordul tău, în FLOW Voice.</small>
            </label>
            <label>
              Biografie
              <textarea
                aria-label="Biografie"
                maxLength={280}
                rows={3}
                value={form.biography}
                onChange={(e) => setForm({ ...form, biography: e.target.value })}
              />
              <small>{form.biography.length}/280 · Profilul este privat.</small>
            </label>
          </section>
          <section className="passport-card identity-form">
            <h2>Mobilitate, în stilul tău</h2>
            <label>
              Prioritate în SmartMatch
              <select
                value={form.preferences.mode}
                onChange={(e) =>
                  setForm({
                    ...form,
                    preferences: {
                      ...form.preferences,
                      mode: e.target.value as typeof form.preferences.mode,
                    },
                  })
                }
              >
                <option value="balanced">Echilibrat</option>
                <option value="cheap">Mai ieftin</option>
                <option value="less_walk">Mai puțin mers</option>
              </select>
            </label>
            <label>
              Maximum minute de mers pe jos
              <input
                type="number"
                min={2}
                max={30}
                value={form.preferences.maxWalkMinutes}
                onChange={(e) =>
                  setForm({
                    ...form,
                    preferences: {
                      ...form.preferences,
                      maxWalkMinutes: +e.target.value,
                    },
                  })
                }
              />
            </label>
            <label className="identity-check">
              <input
                type="checkbox"
                checked={form.preferences.schoolZone}
                onChange={(e) =>
                  setForm({
                    ...form,
                    preferences: {
                      ...form.preferences,
                      schoolZone: e.target.checked,
                    },
                  })
                }
              />
              <span>Include recomandările School Shield</span>
            </label>
          </section>
        </div>
        <aside>
          <section className="passport-card identity-form">
            <Sparkles size={24} />
            <h2>Vocea care te cunoaște.</h2>
            <p>
              FLOW Voice te strigă pe nickname și ține minte ce ați vorbit, ca să continue de unde
              ați rămas, chiar și în altă zi sau pe alt telefon. În Buddy, poți trimite la cerere
              ultimul răspuns către ElevenLabs pentru redare vocală. Microfonul pornește doar la
              apăsare; transcrierea folosește furnizorul browserului.
            </p>
            <label className="identity-check">
              <input
                type="checkbox"
                checked={form.voiceConsent}
                onChange={(e) => setForm({ ...form, voiceConsent: e.target.checked })}
              />
              <span>
                Permit personalizarea vocii: nickname-ul și ultimele {VOICE_MEMORY_LINES} de replici cu
                FLOW Voice se păstrează în contul meu și se trimit către ElevenLabs la o conversație
                nouă; redarea la cerere a răspunsurilor Buddy.
              </span>
            </label>
            <small>
              Nu trimitem emailul, biografia, coordonatele sau audio. Dacă debifezi și salvezi,
              memoria FLOW Voice se șterge. Modificarea se aplică la o sesiune vocală nouă.
            </small>
            {form.voiceConsent && <ForgetVoiceMemory />}
          </section>
          {id.mode === 'local' ? (
          <section className="passport-card">
            <ShieldCheck size={24} />
            <h2>Fără cont, pe acest dispozitiv.</h2>
            <p>
              Nu ai nevoie de cont: profilul, monedele și memoria vocii sunt legate de acest browser
              printr-un identificator aleator. Pe alt telefon sau browser începi un profil nou.
            </p>
            <a href="/confidentialitate">
              Date și confidențialitate <ArrowUpRight size={14} />
            </a>
          </section>
          ) : (
          <section className="passport-card">
            <ShieldCheck size={24} />
            <h2>Securitate prin Auth0.</h2>
            <p>
              {id.emailVerified === true
                ? 'Adresa de email este verificată.'
                : id.emailVerified === false
                  ? 'Adresa de email nu este încă verificată. Verifică mesajul primit de la Auth0.'
                  : 'Starea verificării emailului nu este disponibilă.'}
            </p>
            <p>
              Parola, recuperarea și Passkey sunt gestionate în autentificarea oficială. Passkey
              poate folosi biometria sau PIN-ul dispozitivului.
            </p>
            <button
              type="button"
              className="identity-secondary"
              onClick={() => void id.login(false, true)}
            >
              Deschide autentificarea Auth0
            </button>
            <a href="/confidentialitate">
              Date și confidențialitate <ArrowUpRight size={14} />
            </a>
          </section>
          )}
        </aside>
        <div className="passport-savebar">
          {error && (
            <p role="alert" className="identity-alert">
              {error}
            </p>
          )}
          {success && (
            <p role="status" className="identity-success">
              <Check size={17} />
              {success}
            </p>
          )}
          <span>{dirty ? 'Ai modificări nesalvate.' : 'Profil sincronizat cu contul tău.'}</span>
          <div className="identity-actions">
            <button
              type="button"
              className="identity-secondary"
              disabled={busy}
              onClick={() => navigate('/profile')}
            >
              Anulează
            </button>
            <button className="identity-primary" disabled={busy || !dirty}>
              {busy ? 'Salvăm…' : 'Salvează modificările'}
              <Check size={17} />
            </button>
          </div>
        </div>
      </form>
      <details className="passport-card passport-danger">
        <summary>Ștergerea datelor FLOW</summary>
        <p>
          Șterge definitiv profilul, fotografia, preferințele, activitățile, monedele FLOW și memoria
          vocii.{' '}
          {id.mode === 'local'
            ? 'Browserul primește apoi un profil nou, gol.'
            : 'Identitatea Auth0 rămâne; la reconectare se creează un profil FLOW nou. Pentru ștergerea identității Auth0 folosește contactul din pagina de confidențialitate.'}
        </p>
        <label className="identity-check">
          <input
            type="checkbox"
            checked={deleting}
            onChange={(e) => setDeleting(e.target.checked)}
          />
          Confirm că doresc ștergerea datelor FLOW.
        </label>
        <button
          type="button"
          disabled={!deleting || busy}
          onClick={() => {
            if (!window.confirm('Ștergi definitiv toate datele FLOW?')) return;
            setBusy(true);
            dirtyRef.current = false;
            void id.erase().catch((e) => {
              setError(e.message);
              setBusy(false);
            });
          }}
        >
          <Trash2 size={16} />
          Șterge datele FLOW
        </button>
      </details>
      {file && (
        <AvatarCropper
          file={file}
          onClose={() => setFile(null)}
          onConfirm={async (blob) => {
            await id.upload(blob);
            setSuccess('Fotografie salvată în cont.');
          }}
        />
      )}
    </div>
  );
}
