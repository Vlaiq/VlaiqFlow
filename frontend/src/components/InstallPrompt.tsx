import { useEffect, useState } from 'react';
import { Download, Share2 } from 'lucide-react';
import { clearInstallPrompt, getInstallPrompt, registerPwa } from '../app/pwa';

export function InstallPrompt({ showHelp = false }: { showHelp?: boolean }) {
  const [prompt, setPrompt] = useState(getInstallPrompt);
  const [standalone, setStandalone] = useState(false);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const ios = typeof navigator !== 'undefined' && (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
  useEffect(() => {
    registerPwa();
    const refresh = () => {
      setPrompt(getInstallPrompt());
      setStandalone(window.matchMedia('(display-mode: standalone)').matches || !!(navigator as Navigator & { standalone?: boolean }).standalone);
    };
    refresh();
    window.addEventListener('vlaiq-install-ready', refresh);
    return () => window.removeEventListener('vlaiq-install-ready', refresh);
  }, []);
  const install = async () => {
    if (!prompt) return;
    setBusy(true);
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      setStatus(choice.outcome === 'accepted' ? 'Instalarea a fost solicitată browserului.' : 'Poți instala aplicația mai târziu din meniul browserului.');
    } catch { setStatus('Browserul nu a putut deschide instalarea. Poți încerca din meniul său.'); }
    finally { clearInstallPrompt(); setPrompt(null); setBusy(false); }
  };
  if (standalone) return showHelp ? <p role="status" className="text-sm text-muted">Aplicația rulează deja în propria fereastră.</p> : null;
  if (!prompt && !ios && !showHelp && !status) return null;
  return <section aria-label="Instalarea aplicației" className="rounded-card border border-border bg-surface p-4 text-sm">
    {prompt && <button type="button" disabled={busy} onClick={() => void install()} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 font-semibold text-primary-fg disabled:opacity-50"><Download size={17}/>{busy ? 'Se deschide instalarea…' : 'Instalează VLAIQ FLOW'}</button>}
    {ios && !prompt && <details><summary className="flex min-h-11 cursor-pointer items-center gap-2 font-semibold"><Share2 size={17}/>Instalare pe iPhone sau iPad</summary><p className="mt-2 leading-relaxed text-muted">În Safari, deschide meniul Partajează și alege „Adaugă la ecranul principal”. Denumirea poate varia în funcție de versiunea iOS.</p></details>}
    {!ios && !prompt && showHelp && <details><summary className="min-h-11 cursor-pointer py-3 font-semibold">Cum păstrez aplicația pe dispozitiv?</summary><p className="mt-2 leading-relaxed text-muted">Pe un site HTTPS, Chrome sau Edge pot oferi „Instalează aplicația” în bara de adresă sau în meniul browserului. Opțiunea depinde de browser și de pregătirea aplicației. Localizarea pe telefon necesită HTTPS.</p></details>}
    {status && <p role="status" className="mt-2 leading-relaxed text-muted">{status}</p>}
    {(showHelp || prompt || ios) && <p className="mt-3 text-xs leading-relaxed text-muted">Instalarea nu oferă automat hartă sau urmărire GPS în fundal. Rutarea, datele noi și evaluarea recompenselor au nevoie de internet.</p>}
  </section>;
}
