import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Bike,
  Check,
  ChevronRight,
  CircleHelp,
  Footprints,
  Leaf,
  LoaderCircle,
  Map,
  Pause,
  Play,
  Route,
  ShieldCheck,
  Sparkles,
  Timer,
  Trophy,
  Wallet,
  X,
} from 'lucide-react';
import {
  brand,
  MOTION_RULES,
  motionNames,
  motionDistance,
  type MotionMode,
  type MotionPoint,
  type MotionResult,
  type MotionWallet,
} from '@vlaiq/shared';
import { FlowCoin } from './FlowCoin';
import { motionApi } from './motionApi';
import { useActivity } from './useActivity';
import { ConfirmDialog, DataSourceInfo } from '../../components/ui';
import './motion.css';

const Icons = { walk: Footprints, run: Route, cycle: Bike };
export type MotionTab = 'home' | 'missions' | 'wallet' | 'league';
type Tab = MotionTab;
export interface MotionScreenProps {
  embedded?: boolean;
  tab?: MotionTab;
  onTabChange?: (tab: MotionTab) => void;
  onActivityChange?: (active: boolean) => void;
  onWalletChange?: (balance: number) => void;
  initialMode?: MotionMode;
}
const tabs = [
  { id: 'home', name: 'Mișcare', Icon: Leaf },
  { id: 'missions', name: 'Misiuni', Icon: Sparkles },
  { id: 'wallet', name: 'Portofel', Icon: Wallet },
  { id: 'league', name: 'League', Icon: Trophy },
] as const;
const meters = (n: number) =>
  n >= 1000
    ? `${(n / 1000).toLocaleString('ro-RO', { maximumFractionDigits: 2 })} km`
    : `${Math.round(n)} m`;
const time = (n: number) =>
  `${Math.floor(n / 60)
    .toString()
    .padStart(2, '0')}:${(n % 60).toString().padStart(2, '0')}`;

function Trace({ points, mode }: { points: MotionPoint[]; mode: MotionMode }) {
  const valid: MotionPoint[] = [];
  for (const point of points) {
    if (point.accuracy > MOTION_RULES.accuracy) continue;
    const previous = valid.at(-1);
    if (
      previous &&
      previous.segment === point.segment &&
      (point.timestamp <= previous.timestamp ||
        motionDistance(previous, point) / ((point.timestamp - previous.timestamp) / 1000) >
          MOTION_RULES.maxSpeed[mode])
    )
      continue;
    valid.push(point);
  }
  if (valid.length < 2)
    return (
      <div className="motion-trace-empty">
        <Route size={22} />
        <span>Urma apare din observații GPS precise.</span>
      </div>
    );
  const minX = Math.min(...valid.map((p) => p.lng)),
    minY = Math.min(...valid.map((p) => p.lat));
  const scale = Math.max(
    Math.max(...valid.map((p) => p.lng)) - minX,
    Math.max(...valid.map((p) => p.lat)) - minY,
    0.0003,
  );
  const path = valid
    .map(
      (p, i) =>
        `${i === 0 || valid[i - 1]?.segment !== p.segment || p.timestamp - valid[i - 1]!.timestamp > 25000 ? 'M' : 'L'}${25 + ((p.lng - minX) / scale) * 210},${125 - ((p.lat - minY) / scale) * 100}`,
    )
    .join(' ');
  return (
    <div className="motion-trace">
      <svg viewBox="0 0 270 150" role="img" aria-label="Urma observațiilor GPS, nu traseu rutier">
        <path d={path} fill="none" stroke="#89d5a7" strokeWidth="3" strokeLinecap="round" />
      </svg>
      <span>Observații GPS · fără hartă rutieră</span>
    </div>
  );
}

export function MotionScreen({
  embedded = false,
  tab: controlledTab,
  onTabChange,
  onActivityChange,
  onWalletChange,
  initialMode,
}: MotionScreenProps = {}) {
  const [localTab, setLocalTab] = useState<Tab>('home');
  const tab = controlledTab ?? localTab;
  const setTab = useCallback(
    (next: Tab) => {
      setLocalTab(next);
      onTabChange?.(next);
    },
    [onTabChange],
  );
  const [leaveDialog, setLeaveDialog] = useState(false);
  const activityChange = useRef(onActivityChange);
  activityChange.current = onActivityChange;
  const walletChange = useRef(onWalletChange);
  walletChange.current = onWalletChange;
  const appliedInitialMode = useRef<MotionMode>();
  const [wallet, setWallet] = useState<MotionWallet | null>(null);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [celebrating, setCelebrating] = useState(false);
  const [demoBalance, setDemoBalance] = useState(0);
  const pendingWallet = useRef<MotionWallet | null>(null);
  const rewardStage = useRef<HTMLDivElement>(null);
  const walletPill = useRef<HTMLButtonElement>(null);
  const appliedDemo = useRef<MotionResult | null>(null);
  const [leagueOptIn, setLeagueOptIn] = useState(false);
  const loadWallet = useCallback(async () => {
    setLoading(true);
    setWalletError(null);
    try {
      setWallet(await motionApi.wallet());
    } catch (e) {
      setWalletError(e instanceof Error ? e.message : 'Portofelul nu este disponibil.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void loadWallet();
  }, [loadWallet]);
  const onReward = useCallback((result: MotionResult) => {
    pendingWallet.current = result.wallet;
  }, []);
  const activity = useActivity(onReward);
  const recording = ['acquiring', 'recording', 'paused', 'submitting'].includes(activity.state);
  const completed = activity.state === 'completed';
  const showActivity = recording && (!embedded || tab === 'home');
  const showCompletion = completed && (!embedded || tab === 'home');
  useEffect(() => {
    activityChange.current?.(recording);
  }, [recording]);
  useEffect(() => {
    if (initialMode && initialMode !== appliedInitialMode.current && activity.state === 'idle') {
      activity.setMode(initialMode);
      appliedInitialMode.current = initialMode;
    }
  }, [initialMode, activity.state, activity.setMode]);
  useEffect(() => {
    if (wallet == null) return;
    walletChange.current?.(wallet.balance);
    window.dispatchEvent(
      new CustomEvent('vlaiq-wallet-updated', { detail: { balance: wallet.balance } }),
    );
  }, [wallet?.balance]);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [tab, recording, completed]);
  const reward = activity.result?.evaluation.coins ?? 0;
  const settleReward = useCallback(() => {
    if (pendingWallet.current) {
      setWallet(pendingWallet.current);
      pendingWallet.current = null;
    }
    if (activity.demo && activity.result && appliedDemo.current !== activity.result) {
      setDemoBalance((b) => b + activity.result!.evaluation.coins);
      appliedDemo.current = activity.result;
    }
    setCelebrating(false);
  }, [activity.demo, activity.result]);
  useEffect(() => {
    if (!completed || !activity.result) return;
    setCelebrating(reward > 0);
    const stage = rewardStage.current?.getBoundingClientRect(),
      pill = (
        walletPill.current ?? document.querySelector<HTMLElement>('[data-flow-wallet-target]')
      )?.getBoundingClientRect();
    if (stage && pill) {
      rewardStage.current!.style.setProperty(
        '--reward-x',
        `${pill.left + pill.width / 2 - stage.left - stage.width / 2}px`,
      );
      rewardStage.current!.style.setProperty(
        '--reward-y',
        `${pill.top + pill.height / 2 - stage.top - stage.height / 2}px`,
      );
    }
    if (!reward || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      settleReward();
      return;
    }
    const timer = window.setTimeout(settleReward, 1800);
    return () => clearTimeout(timer);
  }, [completed, activity.result, reward, settleReward]);
  useEffect(() => {
    if (controlledTab != null && completed) settleReward();
    // A shell tab change settles the reward but preserves the session and summary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controlledTab]);
  const ModeIcon = Icons[activity.mode];
  const todayComplete = (wallet?.todayActivities ?? 0) > 0;
  const distance = wallet?.transactions.reduce((s, t) => s + t.distance, 0) ?? 0;
  const seconds = wallet?.transactions.reduce((s, t) => s + t.seconds, 0) ?? 0;
  const weekly = Array.from({ length: 7 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - 6 + i);
    return {
      day: date.toLocaleDateString('ro-RO', { weekday: 'short' }).slice(0, 2),
      value:
        wallet?.transactions
          .filter((t) => new Date(t.awardedAt).toDateString() === date.toDateString())
          .reduce((s, t) => s + t.distance, 0) ?? 0,
    };
  });
  const openWallet = () => {
    settleReward();
    if (completed) void activity.cancel();
    setTab('wallet');
  };

  return (
    <main className={`motion-app ${embedded ? 'motion-embedded' : ''}`}>
      <div className="motion-shell">
        {!embedded && (
          <header className="motion-header">
            <a href="/" className="motion-logo" aria-label="VLAIQ FLOW — înapoi la hartă">
              <span>
                <Leaf size={20} />
              </span>
              <div>
                {brand.team}
                <small>MOTION</small>
              </div>
            </a>
            <div className="motion-header-right">
              <span className="motion-prototype">PROTOTIP</span>
              <button
                ref={walletPill}
                disabled={recording}
                className={`motion-wallet-pill ${celebrating ? 'receiving' : ''}`}
                aria-label={`Portofel, ${wallet?.balance ?? 0} FLOW Coins`}
                onClick={openWallet}
              >
                <FlowCoin size={27} />
                <strong>{wallet?.balance ?? '—'}</strong>
              </button>
            </div>
          </header>
        )}
        {!showActivity && !showCompletion && (
          <div className="motion-intro">
            <div>
              <p>UN ORAȘ MAI VERDE ÎNCEPE CU TINE</p>
              <h1>
                {tab === 'wallet'
                  ? 'Pași mici. Valoare adunată.'
                  : tab === 'missions'
                    ? 'Un motiv în plus să pornești.'
                    : tab === 'league'
                      ? 'Împreună, în mișcare.'
                      : 'Fiecare pas contează.'}
              </h1>
            </div>
            <a href="/" className="motion-explore">
              <Map size={17} /> Explorează orașul <ArrowRight size={16} />
            </a>
          </div>
        )}
        {embedded && (recording || completed) && tab !== 'home' && (
          <div className="motion-session-return" role="status">
            <span>
              {recording
                ? `${motionNames[activity.mode]} · activitate ${activity.state === 'paused' ? 'în pauză' : 'în curs'}`
                : 'Activitatea ta a fost încheiată.'}
            </span>
            <button type="button" onClick={() => setTab('home')}>
              {recording ? 'Revino la activitate' : 'Vezi rezumatul'}
              <ArrowRight size={16} />
            </button>
          </div>
        )}
        {walletError && (
          <div className="motion-alert" role="alert">
            <CircleHelp size={18} />
            <span>{walletError}</span>
            <button onClick={() => void loadWallet()}>Reîncearcă</button>
          </div>
        )}
        {activity.error && (
          <div className="motion-alert" role="alert">
            <CircleHelp size={18} />
            <span>{activity.error}</span>
          </div>
        )}

        {showActivity ? (
          <section className="motion-recording motion-panel">
            <div className="motion-section-label">
              <span>
                <ModeIcon size={16} />
                {motionNames[activity.mode]}
              </span>
              <span className={activity.demo ? 'motion-demo-tag' : 'motion-live-tag'}>
                {activity.demo
                  ? 'DEMO · 20×'
                  : activity.state === 'paused'
                    ? 'PAUZĂ'
                    : 'GPS · ÎNREGISTRARE'}
              </span>
            </div>
            <h1>
              {activity.state === 'acquiring'
                ? 'Găsim punctul de plecare.'
                : activity.state === 'paused'
                  ? 'Un moment de respiro.'
                  : 'Ești pe drumul cel bun.'}
            </h1>
            <p className="motion-muted">
              {activity.demo
                ? 'Observații sintetice. Recompensele rămân în portofelul DEMO.'
                : 'Ține aplicația în prim-plan. Nu privi telefonul în mers.'}
            </p>
            <div
              className="activity-ring"
              style={
                {
                  '--progress': Math.min(
                    1,
                    activity.evaluation.distance / MOTION_RULES.minDistance[activity.mode],
                  ),
                } as CSSProperties
              }
            >
              <svg viewBox="0 0 240 240" aria-hidden="true">
                <circle cx="120" cy="120" r="107" />
                <circle className="activity-ring-progress" cx="120" cy="120" r="107" />
              </svg>
              <div>
                <ModeIcon size={25} />
                <strong>{meters(activity.evaluation.distance)}</strong>
                <span>distanță GPS provizorie</span>
                <small>
                  {time(activity.elapsed)} timp activ{activity.demo ? ' în demo' : ''}
                </small>
              </div>
            </div>
            <div className="motion-gps-status" role="status">
              <i />
              {activity.gps}
            </div>
            <Trace points={activity.points} mode={activity.mode} />
            <div className="motion-sensor-row">
              <span>{activity.sensor}</span>
              {!activity.demo && (
                <button onClick={() => void activity.enableSensor()}>
                  Activează senzorii opționali
                </button>
              )}
            </div>
            <div className="provisional-reward">
              <FlowCoin size={34} />
              <span>
                Recompensă posibilă
                <strong>{activity.evaluation.coins || '10–40'} FLOW Coins</strong>
              </span>
              <small>Doar după evaluare.</small>
            </div>
            <div className="activity-actions">
              <button
                className="motion-button secondary"
                disabled={activity.state === 'acquiring' || activity.state === 'submitting'}
                onClick={activity.state === 'paused' ? activity.resume : activity.pause}
              >
                {activity.state === 'paused' ? <Play size={18} /> : <Pause size={18} />}{' '}
                {activity.state === 'paused' ? 'Continuă' : 'Pauză'}
              </button>
              <button
                className="motion-button primary"
                disabled={activity.state === 'acquiring' || activity.state === 'submitting'}
                onClick={() => void activity.finish()}
              >
                {activity.state === 'submitting' ? (
                  <LoaderCircle size={18} className="motion-spin" />
                ) : (
                  <Check size={18} />
                )}{' '}
                {activity.state === 'submitting' ? 'Evaluăm…' : 'Încheie activitatea'}
              </button>
            </div>
            <button
              className="motion-cancel"
              disabled={activity.state === 'submitting'}
              onClick={() => void activity.cancel()}
            >
              <X size={15} /> Anulează fără recompense
            </button>
          </section>
        ) : showCompletion ? (
          <section
            className={`motion-completion motion-panel ${celebrating ? 'is-celebrating' : ''}`}
            aria-label="Rezultatul activității"
          >
            <span className={activity.demo ? 'motion-demo-tag' : 'motion-live-tag'}>
              {activity.demo ? 'DEMO · SOLD SEPARAT' : 'ACTIVITATE EVALUATĂ'}
            </span>
            <h1>{reward > 0 ? 'Mișcarea ta merită.' : 'Fiecare ieșire e un început.'}</h1>
            <p className="motion-muted">
              {reward > 0
                ? 'Un pas pentru tine. Mai mult loc pentru oraș.'
                : 'Recompensa depinde de observații GPS plauzibile.'}
            </p>
            <div ref={rewardStage} className="reward-coin-stage">
              <span className="reward-orbit" />
              <FlowCoin size={230} animated celebrating={celebrating} />
            </div>
            <div className="motion-reward-number" role="status">
              +{reward}
              <span>
                {brand.currency}
                {activity.demo ? ' DEMO' : ''}
              </span>
            </div>
            <p className="reward-reason">{activity.result?.evaluation.reason}</p>
            <div className="completion-stats">
              <span>
                <strong>{meters(activity.result?.evaluation.distance ?? 0)}</strong>distanță GPS
                estimată
              </span>
              <span>
                <strong>{time(activity.result?.evaluation.seconds ?? 0)}</strong>observații active
              </span>
              <span>
                <strong>
                  <ModeIcon size={20} />
                </strong>
                {motionNames[activity.mode]}
              </span>
            </div>
            <button
              className="motion-button primary"
              onClick={() => {
                settleReward();
                void activity.cancel();
                setTab('wallet');
              }}
            >
              Vezi portofelul <ArrowRight size={18} />
            </button>
            {celebrating && (
              <button className="motion-cancel" onClick={settleReward}>
                Omite animația
              </button>
            )}
            {activity.demo && (
              <p className="motion-disclaimer">Sold DEMO: {demoBalance} · exclus din soldul GPS.</p>
            )}
          </section>
        ) : (
          <>
            {tab === 'home' && (
              <div className="motion-home-grid">
                <section className="motion-hero motion-panel">
                  <div className="motion-section-label">
                    <span>
                      <Sparkles size={15} /> MISIUNEA TA DE AZI
                    </span>
                    <span>
                      {new Date().toLocaleDateString('ro-RO', { day: 'numeric', month: 'long' })}
                    </span>
                  </div>
                  <div className="motion-hero-content">
                    <div>
                      <span className="motion-eyebrow">MAI PUȚIN TRAFIC. MAI MULTĂ VIAȚĂ.</span>
                      <h2>
                        Ieși la o<br />
                        <em>gură de verde.</em>
                      </h2>
                      <p>
                        Un drum scurt, făcut în ritmul tău.
                        <br />
                        Începe cu 150 m de mers pe jos.
                      </p>
                      <div className="mission-reward">
                        <FlowCoin size={31} />
                        <span>
                          de la <strong>10</strong> FLOW Coins
                        </span>
                      </div>
                    </div>
                    <div className="hero-coin">
                      <FlowCoin size={208} animated interactive />
                    </div>
                  </div>
                  <div className="motion-mission-bottom">
                    <span>
                      {todayComplete ? <Check size={14} /> : <Leaf size={14} />}{' '}
                      {todayComplete
                        ? 'Ai încheiat o activitate eligibilă astăzi.'
                        : 'Fără serii obligatorii. În ritmul tău.'}
                    </span>
                    <button onClick={() => setTab('missions')} aria-label="Vezi regulile misiunii">
                      <ArrowRight size={17} />
                    </button>
                  </div>
                </section>
                <section className="motion-start-card motion-panel">
                  <div className="motion-section-label">
                    <span>O ALEGERE BUNĂ PENTRU AZI</span>
                    <span>01</span>
                  </div>
                  <h2>Cum te miști?</h2>
                  <div className="activity-mode-options">
                    {(['walk', 'run', 'cycle'] as MotionMode[]).map((mode) => {
                      const Icon = Icons[mode];
                      return (
                        <button
                          key={mode}
                          onClick={() => activity.setMode(mode)}
                          aria-pressed={activity.mode === mode}
                          className={activity.mode === mode ? 'selected' : ''}
                        >
                          <Icon size={23} />
                          <span>{motionNames[mode]}</span>
                          {activity.mode === mode && <Check className="mode-check" size={12} />}
                        </button>
                      );
                    })}
                  </div>
                  <button
                    className="motion-button primary"
                    disabled={loading || !!walletError}
                    onClick={() => void activity.start()}
                  >
                    <Play size={16} fill="currentColor" /> Începe activitatea{' '}
                    <ArrowRight size={18} />
                  </button>
                  <div className="start-card-note">
                    <ShieldCheck size={15} />
                    <span>GPS real. Recompense evaluate pe server.</span>
                  </div>
                  <button className="motion-demo-link" onClick={() => void activity.start(true)}>
                    Explorează experiența DEMO <ChevronRight size={15} />
                  </button>
                </section>
                <section className="motion-week motion-panel">
                  <div className="motion-section-label">
                    <span>PROGRESUL TĂU</span>
                    <span>ULTIMELE 7 ZILE</span>
                  </div>
                  <div className="weekly-title">
                    <h2>Pașii se adună.</h2>
                    <span>{meters(weekly.reduce((s, d) => s + d.value, 0))}</span>
                  </div>
                  <div
                    className="weekly-chart"
                    role="img"
                    aria-label={`Distanță eligibilă estimată în ultimele 7 zile: ${meters(weekly.reduce((s, d) => s + d.value, 0))}`}
                  >
                    {weekly.map((d, i) => (
                      <div key={i}>
                        <div
                          className={`weekly-bar ${i === 6 ? 'today' : ''}`}
                          style={{
                            height: `${Math.max(4, (d.value / Math.max(500, ...weekly.map((v) => v.value))) * 65)}px`,
                          }}
                        />
                        <span>{d.day}</span>
                      </div>
                    ))}
                  </div>
                  <div className="weekly-footer">
                    <span>
                      <strong>{wallet?.transactions.length ?? 0}</strong> activități recompensate
                    </span>
                    <span>
                      <strong>{Math.floor(seconds / 60)}</strong> minute în mișcare
                    </span>
                  </div>
                </section>
                <section className="motion-league-teaser motion-panel">
                  <div>
                    <span className="motion-eyebrow">{brand.league}</span>
                    <h2>Un oraș. Același sens.</h2>
                    <p>
                      Progresul începe cu tine.
                      <br />
                      Competiția începe cu acordul tău.
                    </p>
                    <button className="motion-text-button" onClick={() => setTab('league')}>
                      Descoperă comunitatea <ArrowRight size={15} />
                    </button>
                  </div>
                  <div className="league-emblem">
                    <Trophy size={43} />
                    <span>ÎMPREUNĂ</span>
                  </div>
                </section>
              </div>
            )}
            {tab === 'wallet' && (
              <div className="motion-wallet-grid">
                <section className="wallet-hero motion-panel">
                  <div className="motion-section-label">
                    <span>PORTOFELUL TĂU</span>
                    <span>FLOW</span>
                  </div>
                  <FlowCoin size={235} animated interactive />
                  <span className="motion-eyebrow">MIȘCARE TRANSFORMATĂ ÎN PROGRES</span>
                  <h2>
                    {loading ? '—' : (wallet?.balance ?? 0)}
                    <span>{brand.currency}</span>
                  </h2>
                  <p>
                    {wallet?.lifetime ?? 0} câștigate în total · {meters(distance)} din activități
                    eligibile
                  </p>
                  <div className="wallet-limit">
                    <span>
                      {wallet?.dailyEarned ?? 0} / {MOTION_RULES.dailyCap} coins astăzi
                    </span>
                    <div>
                      <i
                        style={{
                          width: `${((wallet?.dailyEarned ?? 0) / MOTION_RULES.dailyCap) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                  <p className="motion-disclaimer">
                    Recompense virtuale, fără valoare monetară.
                    <br />
                    Portofel de prototip legat de acest browser. Fără sincronizare între
                    dispozitive.
                  </p>
                  {demoBalance > 0 && (
                    <div className="demo-wallet-balance">
                      DEMO separat <strong>{demoBalance} FLOW Coins</strong>
                    </div>
                  )}
                </section>
                <section className="wallet-history motion-panel">
                  <div className="motion-section-label">
                    <span>ISTORICUL MIȘCĂRII</span>
                    <span>{wallet?.transactions.length ?? 0} ACTIVITĂȚI</span>
                  </div>
                  <h2>Fiecare coin are un drum.</h2>
                  {!wallet?.transactions.length ? (
                    <div className="motion-empty">
                      <Footprints size={30} />
                      <h3>Primul tău drum te așteaptă.</h3>
                      <p>
                        Încheie o activitate GPS eligibilă.
                        <br />
                        Recompensa și motivul apar aici automat.
                      </p>
                      <button className="motion-button secondary" onClick={() => setTab('home')}>
                        Începe de aici <ArrowRight size={16} />
                      </button>
                    </div>
                  ) : (
                    <div className="transaction-list">
                      {wallet.transactions.map((t) => {
                        const Icon = Icons[t.mode];
                        return (
                          <article key={t.id}>
                            <span className="transaction-icon">
                              <Icon size={20} />
                            </span>
                            <div>
                              <strong>{motionNames[t.mode]}</strong>
                              <p>
                                {meters(t.distance)} ·{' '}
                                {new Date(t.awardedAt).toLocaleDateString('ro-RO', {
                                  day: 'numeric',
                                  month: 'short',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </p>
                              <small>GPS evaluat · prototip</small>
                            </div>
                            <span className="transaction-value">
                              +{t.coins}
                              <FlowCoin size={25} />
                            </span>
                          </article>
                        );
                      })}
                    </div>
                  )}
                  <DataSourceInfo
                    source="Jurnalul de recompense al acestui browser · observații GPS evaluate pe server"
                    quality="estimated"
                    updatedAt={wallet?.transactions[0]?.awardedAt}
                  >
                    <p>
                      Soldul provine din tranzacțiile serverului. Coordonatele GPS sunt evaluate și
                      apoi eliminate. DEMO are un sold separat.
                    </p>
                  </DataSourceInfo>
                </section>
              </div>
            )}
            {tab === 'missions' && (
              <section className="motion-missions">
                <div className="motion-panel mission-large">
                  <div className="motion-section-label">
                    <span>
                      <Leaf size={16} /> MISIUNE ZILNICĂ
                    </span>
                    <span>{todayComplete ? 'ÎNCHEIATĂ' : 'LA ALEGEREA TA'}</span>
                  </div>
                  <h2>Fă loc mișcării.</h2>
                  <p>
                    O ieșire pe jos, o alergare sau o deplasare cu bicicleta. Alege varianta
                    potrivită pentru tine, fără presiunea unei serii zilnice.
                  </p>
                  <div className="mission-criteria">
                    <span>
                      <Timer size={17} /> Minimum 90 s de observații valide
                    </span>
                    <span>
                      <Route size={17} /> 150 m pe jos / alergare · 300 m bicicletă
                    </span>
                    <span>
                      <ShieldCheck size={17} /> Deplasare plauzibilă, evaluată pe server
                    </span>
                  </div>
                  <div className="mission-earned">
                    <FlowCoin size={55} />
                    <div>
                      <strong>10–40 FLOW Coins</strong>
                      <p>Recompensa activității, fără bonus duplicat de misiune.</p>
                    </div>
                  </div>
                  <button className="motion-button primary" onClick={() => setTab('home')}>
                    Alege cum te miști
                    <ArrowRight size={17} />
                  </button>
                </div>
                <aside className="motion-panel motion-rules">
                  <span className="motion-eyebrow">CLAR, DE LA PRIMUL PAS</span>
                  <h2>Câștigi prin mișcare.</h2>
                  <p>
                    10 coins pentru o activitate eligibilă, plus 5 pentru fiecare 250 m acceptați.
                    Maximum 40 per activitate și 80 pe zi.
                  </p>
                  <p>
                    Pragurile sunt reguli de prototip, nu standarde științifice. GPS-ul browserului
                    poate fi imitat; nu pretindem protecție perfectă împotriva fraudei.
                  </p>
                  <p>
                    Mersul pe jos nu dovedește o călătorie cu mașina evitată. Nu calculăm emisii
                    fără o sursă și o ipoteză explicită.
                  </p>
                  <a href="/" className="motion-text-button">
                    Planifică un drum cu SmartMatch <ArrowRight size={16} />
                  </a>
                </aside>
              </section>
            )}
            {tab === 'league' && (
              <section className="league-preview motion-panel">
                <span className="motion-demo-tag">
                  PREVIZUALIZARE LOCALĂ · FĂRĂ CLASAMENT PUBLIC
                </span>
                <div className="league-emblem">
                  <Trophy size={50} />
                </div>
                <h2>{brand.league}</h2>
                <p>
                  O comunitate care alege să se miște.
                  <br />
                  Participarea rămâne mereu alegerea ta.
                </p>
                {!leagueOptIn ? (
                  <button className="motion-button primary" onClick={() => setLeagueOptIn(true)}>
                    Participă la previzualizarea locală <ArrowRight size={16} />
                  </button>
                ) : (
                  <>
                    <div className="league-own-row">
                      <span>01</span>
                      <span className="league-avatar">
                        <Leaf size={19} />
                      </span>
                      <div>
                        <strong>Tu · participant local</strong>
                        <small>Singurul participant din această previzualizare</small>
                      </div>
                      <strong>
                        {wallet?.dailyEarned ?? 0}
                        <FlowCoin size={26} />
                      </strong>
                    </div>
                    <button className="motion-text-button" onClick={() => setLeagueOptIn(false)}>
                      Retrage participarea <X size={15} />
                    </button>
                  </>
                )}
                <p className="motion-disclaimer">
                  Nu inventăm participanți sau clasamente ale orașului.
                  <br />
                  DEMO este exclus. Nicio locație sau urmă GPS nu este publicată.
                  <br />
                  Competițiile între participanți reali nu sunt încă implementate.
                </p>
              </section>
            )}
          </>
        )}
        {!showActivity && !showCompletion && (
          <footer className="motion-footer">
            <span>
              <Leaf size={13} /> Mai multă mișcare. Mai mult loc pentru oraș.
            </span>
            <span>GPS evaluat, nu atestat hardware.</span>
          </footer>
        )}
        {!embedded && !showActivity && !showCompletion && (
          <nav className="motion-nav" aria-label="Secțiuni Motion">
            <a href="/">
              <Map size={19} />
              <span>Explorează</span>
            </a>
            {tabs.map(({ id, name, Icon }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                aria-current={tab === id ? 'page' : undefined}
                className={tab === id ? 'selected' : ''}
              >
                <Icon size={19} />
                <span>{name}</span>
                {tab === id && <i />}
              </button>
            ))}
          </nav>
        )}
        {!embedded && (recording || completed) && (
          <a
            href="/"
            className="motion-leave"
            onClick={(event) => {
              if (recording) {
                event.preventDefault();
                setLeaveDialog(true);
              }
            }}
          >
            <ArrowLeft size={15} /> Înapoi la hartă
          </a>
        )}
        <ConfirmDialog
          open={leaveDialog}
          title="Oprești activitatea?"
          description="Observațiile nesalvate se vor pierde. Nu se vor acorda recompense pentru anulare."
          confirmLabel="Oprește și revino la hartă"
          cancelLabel="Continuă activitatea"
          danger
          onCancel={() => setLeaveDialog(false)}
          onConfirm={() => {
            void activity.cancel().finally(() => {
              window.location.href = '/';
            });
          }}
        />
      </div>
    </main>
  );
}
