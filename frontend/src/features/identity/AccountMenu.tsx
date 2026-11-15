import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import {
  ChevronDown,
  LogOut,
  UserRound,
  Wallet,
  Activity,
  Settings,
  ShieldCheck,
  Pencil,
} from 'lucide-react';
import { useIdentity } from './IdentityProvider';
import { useAppRouter } from '../../app/router';
export function Avatar({ large = false }: { large?: boolean }) {
  const id = useIdentity();
  return (
    <span className={`identity-avatar ${large ? 'is-large' : ''}`}>
      {id.avatar ? (
        <img src={id.avatar} alt="" />
      ) : (
        <span aria-hidden="true">
          {(id.profile?.nickname ?? 'F').slice(0, 2).toLocaleUpperCase('ro')}
        </span>
      )}
    </span>
  );
}
export function AccountMenu() {
  const id = useIdentity(),
    { location } = useAppRouter(),
    [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  const close = (restore = false) => {
    setOpen(false);
    if (restore) trigger.current?.focus();
  };
  useEffect(() => {
    close();
  }, [location.pathname]);
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) close();
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  useEffect(() => {
    if (open) root.current?.querySelector<HTMLElement>('[role=menuitem]')?.focus();
  }, [open]);
  const keyboard = (e: KeyboardEvent) => {
    const items = [...root.current!.querySelectorAll<HTMLElement>('[role=menuitem]')],
      i = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      close(true);
    } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
      e.preventDefault();
      items[
        e.key === 'Home'
          ? 0
          : e.key === 'End'
            ? items.length - 1
            : (i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
      ]?.focus();
    } else if (e.key === 'Tab') close(true);
  };
  if (id.loading)
    return (
      <span className="identity-account-loading" role="status" aria-label="Verificăm contul" />
    );
  if (!id.authenticated)
    return (
      <button aria-label="Conectează-te" className="identity-login" onClick={() => void id.login()}>
        <UserRound size={18} />
        <span>Conectează-te</span>
      </button>
    );
  const links = [
    ['/profile', 'Profilul meu', UserRound],
    ['/profile/edit', 'Editează profilul', Pencil],
    ['/wallet', 'Portofel FLOW', Wallet],
    ['/activities', 'Activitățile mele', Activity],
    ['/settings', 'Setări', Settings],
    ['/confidentialitate', 'Confidențialitate', ShieldCheck],
  ] as const;
  return (
    <div
      ref={root}
      className="identity-account"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) close();
      }}
    >
      <button
        ref={trigger}
        className="identity-account-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="flow-account-menu"
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        <Avatar />
        <span>{id.profile?.nickname ?? (id.profileLoading ? 'Se încarcă…' : 'Contul meu')}</span>
        <ChevronDown size={14} />
      </button>
      {open && (
        <div
          id="flow-account-menu"
          className="identity-dropdown"
          role="menu"
          aria-label="Contul meu"
          onKeyDown={keyboard}
        >
          <div className="identity-dropdown-heading">
            <small>FLOW IDENTITY</small>
            <strong>{id.profile?.displayName ?? 'Contul meu'}</strong>
          </div>
          {links.map(([href, label, Icon]) => (
            <a role="menuitem" href={href} key={href} onClick={() => close()}>
              <Icon size={17} />
              {label}
            </a>
          ))}
          {id.mode === 'auth0' && (
            <button role="menuitem" onClick={() => void id.logout()}>
              <LogOut size={17} />
              Deconectare
            </button>
          )}
        </div>
      )}
    </div>
  );
}
