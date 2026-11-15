import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Check, ChevronRight, CircleHelp, Leaf, LoaderCircle, MessageCircle, Mic, Palette, Send, ShieldCheck, Sparkles, Square, Trees, Volume2, X } from 'lucide-react';
import { COSMETICS, DEFAULT_APPEARANCE, type BuddyAppearance, type BuddyAudioBridge, type BuddyAudioState, type BuddyIdentity, type BuddySnapshot, type CosmeticId, type Difficulty, type MissionId, type PublicMission, type MissionResult } from '../../../../shared/src/buddy/contracts';
import { simulateBuddyCity } from '../../../../shared/src/buddy/city';
import { BuddyRobot } from './BuddyRobot';
import { BuddyCity } from './BuddyCity';
import { useBuddyAnimation } from './animation';
import type { BuddyClient } from './client';
import './buddy.css';

interface Props {
  identity: BuddyIdentity | null; client: BuddyClient; authGateway?: ReactNode;
  onBack(): void; onNavigate(): void; onWalletChange?(balance: number): void;
  navigationActive?: boolean; voiceAvailable?: boolean;
}
const difficulties: Record<Difficulty, string> = { beginner: 'Începător', intermediate: 'Intermediar', advanced: 'Avansat' };
const missionList: { id: MissionId; title: string; tag: string }[] = [
  { id: 'city-balance', title: 'Un centru care respiră', tag: 'MINI-ORAȘ' },
  { id: 'green-route', title: 'Ultimul kilometru', tag: 'MOBILITATE' },
  { id: 'smart-parking', title: 'Mai puține ture', tag: 'PARCARE' },
  { id: 'energy', title: 'Energia la frânare', tag: 'ENERGIE' },
  { id: 'time-tradeoff', title: 'La timp, cu grijă', tag: 'ALEGERI' },
  { id: 'misconception', title: 'Dincolo de slogan', tag: 'GÂNDIRE CRITICĂ' },
];
type Message = { role: 'buddy' | 'user'; text: string; source?: 'gemini' | 'test-fixture' };

export function BuddyScreen(props: Props) {
  if (!props.identity) return <>{props.authGateway ?? <section className="buddy-locked"><ShieldCheck /><h1>FLOW Buddy te așteaptă în contul tău.</h1><p>Autentificarea este necesară pentru conversații și progres.</p></section>}</>;
  // Account changes destroy all chat, requests, audio and preview state, including stale responses.
  return <BuddySession key={JSON.stringify([props.identity.issuer, props.identity.subject])} {...props} identity={props.identity} />;
}
function BuddySession({ identity, client, onBack, onNavigate, onWalletChange, navigationActive = false, voiceAvailable = false }: Props & { identity: BuddyIdentity }) {
  const accountKey = JSON.stringify([identity.issuer, identity.subject]);
  const { state: animation, dispatch } = useBuddyAnimation(accountKey);
  const [snapshot, setSnapshot] = useState<BuddySnapshot | null>(null);
  const [messages, setMessages] = useState<Message[]>([{ role: 'buddy', text: 'Salut! Sunt Buddy. Hai să descoperim împreună cum alegerile mici fac un oraș mai plăcut. Ce te face curios?' }]);
  const [text, setText] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [mission, setMission] = useState<PublicMission | null>(null), [result, setResult] = useState<MissionResult | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty>('beginner'), [choice, setChoice] = useState(''), [hint, setHint] = useState('');
  const [comparison, setComparison] = useState<'before' | 'after'>('before');
  const [panel, setPanel] = useState<'city' | 'lessons' | 'workshop'>('city');
  const [preview, setPreview] = useState<BuddyAppearance | null>(null), [confirmItem, setConfirmItem] = useState<CosmeticId | null>(null);
  const [navigationOffer, setNavigationOffer] = useState(false), [audioState, setAudioState] = useState<BuddyAudioState>('off');
  const lock = useRef(false), alive = useRef(true), pending = useRef<AbortController | null>(null), audio = useRef<BuddyAudioBridge | null>(null);
  const audioLoading = useRef<Promise<BuddyAudioBridge | null> | null>(null), voiceEpoch = useRef(0);
  const navigationRef = useRef(navigationActive); navigationRef.current = navigationActive;
  const transcript = useRef<HTMLDivElement>(null);
  const locale: 'ro' | 'en' = /\b(why|how|what|please|explain|traffic|electric|energy)\b/i.test(text) ? 'en' : 'ro';
  const acceptSnapshot = (s: BuddySnapshot) => { setSnapshot(s); if (s.balance !== null && s.persistence === 'account') onWalletChange?.(s.balance); };
  useEffect(() => {
    alive.current = true;
    const controller = new AbortController();
    client.state(controller.signal).then(s => { if (!controller.signal.aborted) { acceptSnapshot(s); setDifficulty(s.progress.difficulty); } }).catch(() => { if (!controller.signal.aborted) setError('Progresul contului nu este disponibil. Reîncarcă pagina pentru a încerca din nou.'); });
    return () => { alive.current = false; voiceEpoch.current++; controller.abort(); pending.current?.abort(); audio.current?.dispose(); void client.end().catch(() => {}); };
  }, [client]);
  useEffect(() => { transcript.current?.scrollTo({ top: transcript.current.scrollHeight, behavior: 'instant' }); }, [messages, busy]);
  useEffect(() => { if (navigationActive) { voiceEpoch.current++; audio.current?.stop(); } }, [navigationActive]);
  async function perform<T>(task: (signal: AbortSignal) => Promise<T>, success: (data: T) => void) {
    if (lock.current || !alive.current) return;
    lock.current = true; setBusy(true); setError(''); audio.current?.stop();
    const controller = new AbortController(); pending.current = controller;
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(25000)]);
    try {
      const value = await task(signal);
      signal.throwIfAborted(); if (!alive.current) return;
      success(value);
    } catch (e) {
      if (alive.current && !controller.signal.aborted) { setError(e instanceof Error ? e.message : 'Nu am putut continua. Încearcă din nou.'); dispatch({ type: 'REQUEST_ERROR' }); }
    } finally {
      if (alive.current && pending.current === controller) { lock.current = false; setBusy(false); pending.current = null; }
    }
  }
  const activateMission = (m: PublicMission) => {
    setMission(m); setResult(null); setChoice(''); setHint(''); setComparison('before'); setPanel(m.id === 'city-balance' ? 'city' : 'lessons');
    setDifficulty(m.difficulty); dispatch({ type: 'CITY_SCENARIO_STARTED' });
    document.getElementById('buddy-lab')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
  };
  const start = (id: MissionId, level = difficulty) => perform(s => client.start(id, level, s), activateMission);
  function send(message = text) {
    if (!message.trim() || lock.current || !snapshot) return;
    setMessages(m => [...m.slice(-30), { role: 'user', text: message.trim() }]); setText(''); dispatch({ type: 'REQUEST_START' });
    void perform(s => client.chat(message.trim(), locale, s), r => {
      setMessages(m => [...m.slice(-30), { role: 'buddy', text: r.text, source: r.source }]);
      dispatch({ type: 'REQUEST_END' }); setDifficulty(r.difficulty);
      if (r.mission && r.mission.instanceId !== mission?.instanceId) activateMission(r.mission);
      if (r.hint) setHint(r.hint);
      if (r.action.type === 'OPEN_WORKSHOP') setPanel('workshop');
      if (r.action.type === 'SHOW_PROGRESS') setPanel('lessons');
      if (r.action.type === 'REQUEST_NAVIGATION_HANDOFF') setNavigationOffer(true);
    });
  }
  const submitAnswer = () => {
    if (!mission || !choice) return;
    dispatch({ type: 'CITY_SIMULATION_RUNNING' });
    void perform(async signal => {
      const checked = await client.answer(mission.instanceId, choice, signal);
      // Keep a committed answer visible even if a later profile refresh fails.
      const updated = await client.state(signal).catch(() => null);
      return { checked, updated };
    }, ({ checked, updated }) => {
      setResult(checked); setComparison('after');
      if (updated) { acceptSnapshot(updated); setDifficulty(updated.progress.difficulty); }
      dispatch({ type: checked.correct ? 'MISSION_COMPLETED' : 'MISSION_RETRY' });
    });
  };
  async function getAudio() {
    if (!voiceAvailable || navigationRef.current) throw new Error('Vocea Buddy nu este disponibilă acum. Conversația scrisă rămâne activă.');
    if (!audio.current && !audioLoading.current) {
      audioLoading.current = import('./audio').then(({ createBuddyAudio }) => {
        if (!alive.current) return null;
        audio.current = createBuddyAudio({ speech: s => client.speech(s), navigationActive: () => navigationRef.current,
          onState: next => { if (!alive.current) return; setAudioState(next); dispatch({ type: next === 'playing' ? 'VOICE_START' : 'VOICE_END' }); dispatch({ type: next === 'listening' ? 'LISTEN_START' : 'LISTEN_END' }); if (next === 'error') setError('Audio indisponibil sau permisiune refuzată. Poți continua în scris.'); } });
        return audio.current;
      }).finally(() => { audioLoading.current = null; });
    }
    return audio.current ?? audioLoading.current;
  }
  const voiceAction = async (mode: 'listen' | 'speak') => {
    const ticket = ++voiceEpoch.current;
    try { const bridge = await getAudio(); if (!bridge || ticket !== voiceEpoch.current || !alive.current) return; if (mode === 'listen') await bridge.listen(locale, spoken => { if (alive.current) setText(spoken); }); else await bridge.speak('', locale); }
    catch (e) { if (alive.current) setError(e instanceof Error ? e.message : 'Audio indisponibil.'); }
  };
  const baseline = simulateBuddyCity(mission?.scenario ?? { drivers: 30, capacity: 36, seed: 7 }, 'nearest');
  const city = comparison === 'after' && result?.city ? result.city : baseline;
  const completed = snapshot?.progress.completed.length ?? 0;
  const isFixture = snapshot?.persistence === 'test-fixture';
  const appearance = preview ?? snapshot?.appearance ?? DEFAULT_APPEARANCE;
  const status = audioState === 'playing' ? 'Îți vorbesc' : audioState === 'listening' ? 'Te ascult' : animation.thinking ? 'Mă gândesc la întrebarea ta' : busy ? 'Pregătim următorul pas' : 'Sunt aici. Descoperim împreună.';
  return <main className={`buddy-page ${mission?.id === 'city-balance' ? 'buddy-city-focused' : ''}`}>
    {isFixture && <div className="buddy-fixture-banner" role="status">MEDIU DE TEST · identitate, conversație și portofel sintetice · fără monede reale sau persistență în cont</div>}
    <header className="buddy-page-header"><button className="buddy-back" onClick={onBack}><ArrowLeft size={17} /> Provocări</button><span><Leaf size={14} /> FLOW LAB · ÎNVAȚĂ PRIN ALEGERI</span><span className="buddy-private"><ShieldCheck size={14} /> Spațiul tău de învățare</span></header>
    <div className="buddy-heading"><div><span className="buddy-eyebrow">UN ORAȘ MAI BUN ÎNCEPE CU O ÎNTREBARE</span><h1>Salut, eu sunt <span>Buddy.</span><i aria-hidden="true">✳</i></h1><p>Curiozitatea ta. Un pic de joacă. O perspectivă mai verde.</p></div><button className="buddy-outline" onClick={() => { setPanel('workshop'); setPreview(null); }}><Palette size={16} /> Buddy Workshop</button></div>
    <div className="buddy-main-grid">
      <aside className="buddy-stage" aria-label="FLOW Buddy și progresul tău">
        <div className="buddy-stage-top"><span><span className="buddy-status-dot" /> FLOW BUDDY</span><span>01 / COMPANION</span></div>
        <div className="buddy-stage-art"><div className="buddy-stage-orbit" /><div className="buddy-stage-orbit buddy-stage-orbit-inner" /><BuddyRobot state={animation} appearance={appearance} onGestureEnd={generation => dispatch({ type: 'GESTURE_END', generation })} />{preview && <span className="buddy-preview-label">PREVIZUALIZARE · NESALVATĂ</span>}</div>
        <div className="buddy-stage-status" role="status"><span className={busy ? 'buddy-status-dot busy' : 'buddy-status-dot'} />{status}</div>
        <div className="buddy-stage-progress"><div><span className="buddy-stage-icon"><Leaf size={19} /></span><div><strong>{snapshot?.progress.level ?? 'Pregătim progresul…'}</strong><span>{completed} / 6 lecții distincte finalizate</span></div><strong>{Math.round(completed / 6 * 100)}%</strong></div><progress max={6} value={completed} aria-label="Lecții finalizate" /><p>Progresul educațional este separat de activitățile GPS.</p></div>
        <div className="buddy-stage-note"><Sparkles size={16} /><p>Întreabă-mă de ce. Testează o idee. Învață în ritmul tău.</p></div>
      </aside>
      <section className="buddy-conversation" aria-label="Conversație cu Buddy">
        <header><div className="buddy-chat-icon"><MessageCircle size={19} /></div><div><h2>Hai să vorbim despre oraș.</h2><p>Întrebări reale. Explicații pe înțelesul tău.</p></div><span className="buddy-language">RO / EN</span></header>
        <div className="buddy-chat-log" ref={transcript} role="log" aria-live="polite" aria-relevant="additions" tabIndex={0}>{messages.map((m, i) => <div key={i} className={`buddy-message buddy-message-${m.role}`}><span>{m.role === 'user' ? 'TU' : m.source === 'gemini' ? 'BUDDY · GEMINI' : m.source === 'test-fixture' ? 'BUDDY · RĂSPUNS DE TEST' : 'BUDDY · BUN VENIT'}</span><p>{m.text}</p></div>)}{busy && animation.thinking && <div className="buddy-thinking" role="status"><LoaderCircle size={16} /> Îți pregătesc un răspuns…</div>}</div>
        <div className="buddy-suggestions">{['De ce ajută parcarea inteligentă?', 'Vreau să încerc mini-orașul'].map(s => <button key={s} disabled={busy || !snapshot} onClick={() => send(s)}>{s}<ArrowRight size={13} /></button>)}</div>
        {error && <div className="buddy-error" role="alert"><span>{error}</span><button aria-label="Închide mesajul de eroare" onClick={() => setError('')}><X size={16} /></button></div>}
        <form className="buddy-composer" onSubmit={e => { e.preventDefault(); send(); }}><label className="buddy-sr" htmlFor="buddy-message">Mesaj pentru Buddy</label><textarea id="buddy-message" rows={2} maxLength={1200} value={text} onChange={e => setText(e.target.value)} placeholder="Ce te face curios despre mobilitatea verde?" disabled={!snapshot} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }} /><div><span>{text.length} / 1200</span><button type="button" title={voiceAvailable ? 'Permite microfonul pentru un mesaj' : 'Vocea necesită integrare verificată'} aria-label="Pornește microfonul Buddy" disabled={!voiceAvailable || navigationActive || busy} onClick={() => void voiceAction('listen')}><Mic size={18} /></button><button type="submit" className="buddy-send" aria-label="Trimite mesajul" disabled={busy || !text.trim() || !snapshot}><Send size={17} /></button></div></form>
        <footer className="buddy-audio-controls"><span>{voiceAvailable ? 'Microfon doar la cerere. Transcriere prin furnizorul browserului.' : 'Vocea nu este conectată în această versiune.'}</span>{voiceAvailable && <><button disabled={busy || !messages.some(m => m.source)} onClick={() => void voiceAction('speak')}><Volume2 size={15} /> Ascultă</button><button onClick={() => audio.current?.stop()}><Square size={13} /> Oprește</button></>}</footer>
        {navigationOffer && <div className="buddy-navigation-offer"><p>Deschidem planificatorul FLOW pentru rute reale? GPS-ul nu pornește automat.</p><button className="buddy-primary" onClick={onNavigate}>Deschide planificatorul <ArrowRight size={15} /></button><button className="buddy-outline" onClick={() => setNavigationOffer(false)}>Mai târziu</button></div>}
      </section>
    </div>
    <section id="buddy-lab" className="buddy-playground" aria-label="Laboratorul de învățare"><div className="buddy-section-heading"><div><span className="buddy-eyebrow">MAI PUȚINĂ TEORIE. MAI MULT „AHA!”</span><h2>Un loc mic pentru idei mari.</h2></div><nav className="buddy-panel-tabs" aria-label="Experiențe Buddy">{([{ id: 'city', label: 'Mini-oraș', icon: Trees }, { id: 'lessons', label: 'Misiuni', icon: Sparkles }, { id: 'workshop', label: 'Workshop', icon: Palette }] as const).map(({ id, label, icon: Icon }) => <button key={id} aria-pressed={panel === id} onClick={() => { setPanel(id); setPreview(null); }}><Icon size={16} />{label}</button>)}</nav></div>
      {panel === 'city' && <div className="buddy-city-layout"><div className="buddy-city-scene"><div className="buddy-city-top"><span className="buddy-sim-badge">SIMULARE EDUCAȚIONALĂ</span><div role="group" aria-label="Comparație oraș"><button aria-pressed={comparison === 'before'} onClick={() => setComparison('before')}>Înainte</button><button aria-pressed={comparison === 'after'} disabled={!result?.city} onClick={() => setComparison('after')}>După</button></div></div><BuddyCity outcome={city} comparison={comparison} /><div className="buddy-city-metrics">{city.allocations.map(l => <div key={l.lotId}><span>PARCARE {l.lotId.toUpperCase()}</span><strong>{l.occupied}<small> / {l.capacity}</small></strong><span>{Math.round(l.occupied / l.capacity * 100)}% ocupare virtuală</span></div>)}<div><span>TRANSPORT VIRTUAL</span><strong>{city.transitPassengers}<small> persoane</small></strong><span>{city.totalArrived} sosiri în model</span></div></div><details className="buddy-city-assumptions"><summary>Cum funcționează această simulare?</summary><p>{city.assumptions}</p><p>Politica echilibrată: condus + mers pe jos + 8 × ocupare. Aceeași sămânță (7), 30 de persoane, 36 de locuri. Fără prognoze de trafic.</p><p>{city.averageDriveMinutes.toFixed(1)} min condus + {city.averageWalkMinutes.toFixed(1)} min mers pe jos, în medie, doar pentru șoferii parcați. {city.unassigned} șoferi fără loc.</p></details></div><div className="buddy-mission-panel">{mission?.id === 'city-balance' ? renderMission() : <><span className="buddy-eyebrow">MISIUNEA 01 · ORAȘUL TĂU VIRTUAL</span><h3>Un centru care respiră.</h3><p>30 de persoane vor să ajungă în centru. Tu alegi strategia; orașul îți arată ce se schimbă.</p><div className="buddy-mission-facts"><span>3 parcări virtuale</span><span>~ 2 minute</span><span>Rezultate calculate</span></div><button className="buddy-primary" disabled={busy || !snapshot} onClick={() => void start('city-balance')}>Să încercăm <ArrowRight size={16} /></button><small>Poți relua în siguranță. Repetarea unei lecții nu multiplică recompensa.</small></>}</div></div>}
      {panel === 'lessons' && <div className="buddy-lessons-layout"><div className="buddy-lessons-list">{missionList.map((m, i) => <button key={m.id} disabled={busy || !snapshot} onClick={() => void start(m.id)} className={mission?.id === m.id ? 'selected' : ''}><span className="buddy-lesson-number">{snapshot?.progress.completed.some(c => c.missionId === m.id) ? <Check size={20} /> : String(i + 1).padStart(2, '0')}</span><span><small>{m.tag}</small><strong>{m.title}</strong></span><ChevronRight size={17} /></button>)}</div><div className="buddy-mission-panel">{mission ? renderMission() : <><Sparkles size={28} /><h3>Ce descoperim astăzi?</h3><p>Alege o lecție. Fiecare are o întrebare concretă, un indiciu și o explicație verificată.</p><p>Nivelul se adaptează după rezultate; îl poți alege și tu.</p></>}</div></div>}
      {panel === 'workshop' && <div className="buddy-workshop"><div className="buddy-workshop-heading"><h3>Un Buddy pe gustul tău.</h3><p>Previzualizează gratuit. Accesoriile se cumpără doar cu FLOW Coins din portofelul contului.</p>{isFixture ? <span>Achizițiile sunt dezactivate în mediul de test.</span> : <span>{snapshot?.balance ?? '—'} FLOW Coins disponibile</span>}</div><div className="buddy-cosmetics">{COSMETICS.map(item => { const owned = snapshot?.owned.includes(item.id) ?? false; return <article key={item.id}><div className={`buddy-cosmetic-icon buddy-cosmetic-${item.category}`} style={item.color ? { background: item.color } : undefined}>{item.category === 'color' ? <Palette size={25} /> : item.category === 'antenna' ? <Leaf size={25} /> : <Sparkles size={25} />}</div><h4>{item.name}</h4><p>{owned ? 'În colecția ta' : `${item.price} FLOW Coins`}</p><button className="buddy-outline" onClick={() => { const a = { ...(snapshot?.appearance ?? DEFAULT_APPEARANCE) }; if (item.category === 'color') a.color = item.id as BuddyAppearance['color']; if (item.category === 'antenna') a.antenna = true; if (item.category === 'badge') a.badge = true; if (item.category === 'light') a.pulse = true; setPreview(a); window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }); }}>Previzualizează</button><button className="buddy-primary" disabled={busy || !snapshot || isFixture} onClick={() => { if (owned) void perform(s => client.equip(item.id, s), updated => { acceptSnapshot(updated); setPreview(null); dispatch({ type: 'REQUEST_END' }); }); else setConfirmItem(item.id); }}>{owned ? 'Echipează' : 'Cumpără'}</button></article>; })}</div>{preview && <button className="buddy-outline" onClick={() => setPreview(null)}>Încheie previzualizarea</button>}{confirmItem && <div className="buddy-purchase-confirm" role="group" aria-label="Confirmă achiziția"><p>Cumperi {COSMETICS.find(c => c.id === confirmItem)?.name} pentru {COSMETICS.find(c => c.id === confirmItem)?.price} FLOW Coins?</p><button className="buddy-primary" disabled={busy} onClick={() => void perform(s => client.purchase(confirmItem, s), updated => { acceptSnapshot(updated); setConfirmItem(null); setPreview(null); })}>Confirmă achiziția</button><button className="buddy-outline" onClick={() => setConfirmItem(null)}>Anulează</button></div>}</div>}
    </section>
    <footer className="buddy-page-footer"><Leaf size={15} /><span>Alegeri mai informate, pas cu pas.</span><span>Simulările explică idei. FLOW calculează separat rutele reale.</span></footer>
  </main>;

  function renderMission() {
    if (!mission) return null;
    return <><div className="buddy-mission-companion"><BuddyRobot state={animation} appearance={appearance} small /><span>{status}</span></div><div className="buddy-mission-meta"><span className="buddy-eyebrow">{mission.id === 'city-balance' ? 'MINI-ORAȘ' : 'MISIUNE'} · V{mission.version}</span><label>Nivel<select value={mission.difficulty} disabled={busy} onChange={e => void start(mission.id, e.target.value as Difficulty)}>{Object.entries(difficulties).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label></div><h3>{mission.title}</h3><p>{mission.question}</p><fieldset className="buddy-options" disabled={busy || Boolean(result)}><legend className="buddy-sr">Alege o strategie</legend>{mission.options.map(o => <label key={o.id} className={choice === o.id ? 'selected' : ''}><input type="radio" name={`mission-${mission.instanceId}`} value={o.id} checked={choice === o.id} onChange={() => { setChoice(o.id); dispatch({ type: 'CITY_USER_CHOICE' }); }} /><span><strong>{o.label}</strong><small>{o.detail}</small></span></label>)}</fieldset>{!result ? <><button className="buddy-primary" disabled={!choice || busy} onClick={submitAnswer}>{busy ? <LoaderCircle size={16} /> : <Check size={16} />} Verifică alegerea</button><button className="buddy-hint" disabled={busy} onClick={() => void perform(s => client.hint(s), h => setHint(h.text))}><CircleHelp size={15} /> Un mic indiciu</button>{hint && <p className="buddy-hint-text" role="status">{hint}</p>}</> : <div className={`buddy-result ${result.correct ? 'correct' : ''}`} role="status"><strong>{result.correct ? 'Ai găsit ideea!' : 'Hai să privim din alt unghi.'}</strong><p>{result.explanation}</p><p>{result.reward.status === 'credited' ? `+${result.reward.coins} FLOW Coins · confirmate de server${isFixture ? ' (portofel sintetic de test)' : ''}` : result.reward.status === 'already-earned' ? 'Lecție deja recompensată. Poți continua să exersezi.' : result.reward.status === 'daily-limit' ? 'Progres salvat. Limita educațională de astăzi este atinsă.' : result.reward.status === 'unavailable' ? 'Recompensele nu sunt conectate la portofel în această versiune.' : 'Încearcă din nou; nicio monedă nu a fost acordată.'}</p><button className="buddy-outline" onClick={() => void start(mission.id)} disabled={busy}>Mai încerc o dată</button><button className="buddy-hint" onClick={() => send('Explică rezultatul misiunii mele pe scurt.')} disabled={busy}>Întreabă-l pe Buddy <ArrowRight size={14} /></button></div>}</>;
  }
}
