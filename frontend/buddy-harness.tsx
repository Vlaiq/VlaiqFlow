// SYNTHETIC TEST ENTRY. Outside src; not imported by the production application.
import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BuddyScreen } from './src/features/buddy/BuddyScreen';
import { BuddyIntroCard } from './src/features/buddy/BuddyIntroCard';
import { BuddyRobot } from './src/features/buddy/BuddyRobot';
import { initialAnimation, type BuddyPose } from './src/features/buddy/animation';
import { createBuddyClient } from './src/features/buddy/client';
import './src/styles/fonts.css';
import './src/styles/tokens.css';

document.documentElement.dataset.theme = 'light';
Object.assign(document.body.style, { margin: '0', background: 'var(--app-bg)' });
function Harness() {
  const [subject, setSubject] = useState<string | null>('alice');
  const [route, setRoute] = useState('buddy');
  const [pose, setPose] = useState<BuddyPose>('wave');
  const client = useMemo(() => createBuddyClient(async () => `buddy-fixture-${subject}`), [subject]);
  return <>
    <div style={{ display: 'flex', gap: 8, padding: '10px 20px', flexWrap: 'wrap', fontFamily: 'sans-serif', fontSize: 12 }}>
      <button onClick={() => setSubject(subject === 'alice' ? 'bob' : 'alice')}>Schimbă contul de test</button>
      <button onClick={() => setSubject(null)}>Ieși din contul de test</button>
      <button onClick={() => setRoute(route === 'buddy' ? 'challenges' : 'buddy')}>Schimbă pagina de test</button>
      <button onClick={() => { document.documentElement.dataset.theme = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'; }}>Schimbă tema de test</button>
      <button onClick={() => setRoute('rig')}>Verifică rigul</button>
    </div>
    {route === 'challenges' ? <div style={{ padding: 30 }}><BuddyIntroCard onOpen={() => setRoute('buddy')} /></div> : route === 'rig' ? <section style={{ maxWidth: 600, margin: 'auto', padding: 20, color: 'var(--app-text)' }}><label>Expresie <select aria-label="Expresie robot" value={pose} onChange={e => setPose(e.target.value as BuddyPose)}>{(['idle','wave','listening','thinking','talking','curious','explaining','pointing','happy','celebrating','encouraging','sleeping'] as BuddyPose[]).map(p => <option key={p}>{p}</option>)}</select></label><BuddyRobot key={pose} state={{ ...initialAnimation, pose }} /></section> : <BuddyScreen identity={subject ? { issuer: 'https://buddy.test.invalid/', subject } : null} client={client} onBack={() => setRoute('challenges')} onNavigate={() => setRoute('challenges')} />}
  </>;
}
createRoot(document.getElementById('root')!).render(<Harness />);
