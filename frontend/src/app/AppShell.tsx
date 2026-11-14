import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ArrowRight,
  CircleHelp,
  Compass,
  Database,
  Leaf,
  Lock,
  Map,
  Menu,
  Navigation2,
  ShieldCheck,
  Sparkles,
  Trophy,
  Wallet,
  X,
} from 'lucide-react';
import { brand } from '@vlaiq/shared';
import { useAppRouter } from './router';
import { ThemeToggle } from '../components/ui';
import { FlowCoin } from '../features/motion/FlowCoin';
import './shell.css';

const entries = [
  { href: '/', label: 'Explorează', Icon: Map },
  { href: '/motion', label: 'Mișcare', Icon: Leaf },
  { href: '/challenges', label: 'Provocări', Icon: Sparkles },
  { href: '/community', label: 'Comunitate', Icon: Trophy },
];
export function AppShell({
  children,
  balance,
  activityActive,
}: {
  children: ReactNode;
  balance: number | null;
  activityActive: boolean;
}) {
  const { location, navigate } = useAppRouter();
  const [menu, setMenu] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const navigation = location.pathname === '/navigation';
  useEffect(() => {
    setMenu(false);
    if (!['/', '/navigation'].includes(location.pathname)) window.scrollTo(0, 0);
  }, [location.pathname]);
  useEffect(() => {
    if (menu && !dialog.current?.open) dialog.current?.showModal();
    else if (!menu) dialog.current?.close();
  }, [menu]);
  const titles: Record<string, string> = {
    '/': 'Explorează Timișul',
    '/motion': 'FLOW Motion',
    '/challenges': 'Provocările tale',
    '/community': 'GREEN LEAGUE',
    '/wallet': 'Portofel FLOW',
    '/city': 'Pentru Primărie',
    '/data': 'FLOW Data Trust',
    '/help': 'Bine ai venit în FLOW',
    '/confidentialitate': 'Confidențialitate',
    '/privacy': 'Confidențialitate',
  };
  return (
    <div
      className={`flow-app ${location.pathname === '/' ? 'is-explore' : ''} ${navigation ? 'is-navigation' : ''}`}
    >
      <a href="#main-content" className="skip-link">
        Mergi la conținut
      </a>
      {!navigation && (
        <header className="flow-header">
          <a href="/" className="flow-brand" aria-label="VLAIQ FLOW — Explorează">
            <span className="flow-brand-symbol">
              <Navigation2 size={22} fill="currentColor" />
            </span>
            <span>
              {brand.team}
              <b>FLOW</b>
            </span>
          </a>
          <div className="flow-header-title">
            <span className="flow-live-dot" />
            {titles[location.pathname] ?? 'VLAIQ FLOW'}
          </div>
          <div className="flow-header-tools">
            <button
              data-flow-wallet-target
              className="flow-wallet-button"
              onClick={() => navigate('/wallet')}
              aria-label={`Deschide portofelul, ${balance ?? 0} FLOW Coins`}
            >
              <FlowCoin size={28} />
              <strong>{balance ?? '—'}</strong>
              <span>FLOW</span>
            </button>
            <ThemeToggle />
            <button
              className="flow-icon-button"
              aria-label="Deschide meniul aplicației"
              onClick={() => setMenu(true)}
            >
              <Menu size={21} />
            </button>
          </div>
        </header>
      )}
      {!navigation && (
        <nav className="flow-nav" aria-label="Navigare principală">
          {entries.map(({ href, label, Icon }) => (
            <a
              href={href}
              key={href}
              className={
                location.pathname === href ||
                (href === '/motion' && location.pathname === '/wallet')
                  ? 'active'
                  : ''
              }
              aria-current={location.pathname === href ? 'page' : undefined}
            >
              <Icon size={21} />
              <span>{label}</span>
            </a>
          ))}
          <div className="flow-rail-bottom">
            <a href="/data" aria-label="Sursele datelor">
              <ShieldCheck size={20} />
              <span>Surse</span>
            </a>
            <a href="/city" aria-label="Perspectiva pentru Primărie">
              <Database size={20} />
              <span>Primărie</span>
            </a>
          </div>
        </nav>
      )}
      <div id="main-content" className="flow-main" tabIndex={-1}>
        {children}
      </div>
      {activityActive &&
        !['/motion', '/wallet', '/challenges', '/community'].includes(location.pathname) && (
          <button className="flow-activity-banner" onClick={() => navigate('/motion')}>
            <span className="flow-live-dot" /> Activitate în curs <ArrowRight size={16} />
          </button>
        )}
      <dialog
        ref={dialog}
        className="flow-menu"
        onCancel={() => setMenu(false)}
        onClick={(e) => {
          if (e.target === e.currentTarget) setMenu(false);
        }}
      >
        <div className="flow-menu-heading">
          <div>
            <span className="flow-eyebrow">TOTUL ÎN ACELAȘI LOC</span>
            <h2>Drumul tău, în FLOW.</h2>
          </div>
          <button
            className="flow-icon-button"
            aria-label="Închide meniul"
            onClick={() => setMenu(false)}
          >
            <X size={20} />
          </button>
        </div>
        <nav aria-label="Instrumente și informații">
          <a href="/navigation">
            <Compass />
            <span>
              Navigație 3D<small>O rută clară, pas cu pas</small>
            </span>
            <ArrowRight size={17} />
          </a>
          <a href="/wallet">
            <Wallet />
            <span>
              Portofel FLOW<small>Progres din activitățile tale</small>
            </span>
            <ArrowRight size={17} />
          </a>
          <a href="/data">
            <ShieldCheck />
            <span>
              De unde provin datele?<small>Surse, actualizări și limite</small>
            </span>
            <ArrowRight size={17} />
          </a>
          <a href="/city">
            <Database />
            <span>
              Pentru Primărie<small>Date publice și simulări explicite</small>
            </span>
            <ArrowRight size={17} />
          </a>
          <a href="/help">
            <CircleHelp />
            <span>
              Cum funcționează FLOW<small>Demo, confidențialitate și instalare</small>
            </span>
            <ArrowRight size={17} />
          </a>
          <a href="/confidentialitate">
            <Lock />
            <span>
              Confidențialitate<small>Ce date folosim și cum le ștergi</small>
            </span>
            <ArrowRight size={17} />
          </a>
        </nav>
        <div className="flow-menu-footer">
          {brand.tagline}
          <span>Timișoara · Județul Timiș</span>
        </div>
      </dialog>
    </div>
  );
}
