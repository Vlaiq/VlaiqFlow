import { ArrowUpRight, Sparkles } from 'lucide-react';
import { BuddyRobot } from './BuddyRobot';
import { initialAnimation } from './animation';
import './buddy.css';

/** Insert at the top of protected Challenges, retaining the existing Motion missions. */
export function BuddyIntroCard({ completed, onOpen }: { completed?: number; onOpen(): void }) {
  return <section className="buddy-intro" aria-labelledby="buddy-intro-title">
    <BuddyRobot state={{ ...initialAnimation, pose: 'happy' }} small />
    <div><span className="buddy-eyebrow"><Sparkles size={13} /> UN PRIETEN PENTRU UN ORAȘ MAI VERDE</span>
      <h2 id="buddy-intro-title">Pași mici. Idei care schimbă orașul.</h2>
      <p>Întreabă, experimentează și construiește un mini-oraș alături de FLOW Buddy.</p>
      {completed !== undefined && <small>{completed} lecții finalizate în contul tău</small>}
      <button className="buddy-primary" onClick={onOpen}>Cunoaște-l pe FLOW Buddy <ArrowUpRight size={17} /></button>
    </div>
  </section>;
}
