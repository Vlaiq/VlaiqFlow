import { memo, useId, type CSSProperties } from 'react';
import { COSMETICS, DEFAULT_APPEARANCE, type BuddyAppearance } from '../../../../shared/src/buddy/contracts';
import type { AnimationState } from './animation';
import './robot.css';

const labels = { idle: 'relaxat', wave: 'te salută', listening: 'ascultă', thinking: 'se gândește', talking: 'vorbește', curious: 'curios', explaining: 'explică', pointing: 'arată rezultatul', happy: 'bucuros', celebrating: 'sărbătorește', encouraging: 'te încurajează', sleeping: 'odihnit' };
function Leaf({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  return <g transform={`translate(${x} ${y}) scale(${scale})`}><path d="M0 7C-17 8-24-3-24-12C-7-12 0-4 0 7M2 7C1-11 11-22 26-22C27-4 18 7 2 7" fill="currentColor" /><path d="M1 6v12" stroke="currentColor" strokeWidth="4" strokeLinecap="round" /></g>;
}
function Hand({ right, shell, metal }: { right: boolean; shell: string; metal: string }) {
  return <g className={`buddy-hand ${right ? 'buddy-hand-right' : 'buddy-hand-left'}`}>
    <circle r="9" fill={metal} />
    <path d="M-14 6Q-19 23-12 31Q0 39 12 30L14 8Q0 0-14 6Z" fill={shell} stroke="#a2b8b4" strokeWidth="1.1" />
    {[-10, -3, 4, 11].map((x, i) => <g key={x} transform={`translate(${x} 28) rotate(${(i - 1.5) * -9})`}>
      <rect x="-3.7" y="-1" width="7.4" height="17" rx="3.7" fill={metal} />
      <rect x="-3.7" width="7.4" height="8" rx="3.3" fill={shell} /><rect x="-3.7" y="10" width="7.4" height="8" rx="3.7" fill={shell} />
    </g>)}
    <g transform={`translate(${right ? -15 : 15} 13) rotate(${right ? 42 : -42})`}><rect x="-4" width="9" height="18" rx="4" fill={metal} /><rect x="-4" width="9" height="9" rx="4" fill={shell} /><rect x="-4" y="11" width="9" height="10" rx="4" fill={shell} /></g>
    <path d="M-4 18Q0 10 7 12Q7 20-4 22Z" fill="var(--buddy-accent)" />
  </g>;
}
/** Original articulated vector rig, inspired by the user's white/mint eco-robot references. */
export const BuddyRobot = memo(function BuddyRobot({ state, appearance = DEFAULT_APPEARANCE, onGestureEnd, small = false }: {
  state: AnimationState; appearance?: BuddyAppearance; onGestureEnd?: (generation: number) => void; small?: boolean;
}) {
  const id = useId().replace(/:/g, '');
  const shell = `url(#${id}-shell)`, metal = `url(#${id}-metal)`;
  const excited = ['celebrating', 'happy', 'wave'].includes(state.pose);
  const thinking = state.pose === 'thinking';
  const surprised = state.pose === 'curious';
  const mouth = surprised ? 'M204 177C204 165 222 165 222 177C222 190 204 190 204 177Z' : excited ? 'M192 170Q211 175 232 170C230 204 198 205 192 170Z' : thinking ? 'M204 180Q214 175 224 180' : 'M196 176Q212 193 230 176';
  const accent = COSMETICS.find(c => c.id === appearance.color)?.color ?? '#72e5b0';
  return <div className={`buddy-robot ${small ? 'buddy-robot-small' : ''}`} data-pose={state.pose} style={{ '--buddy-accent': accent, '--gaze-x': `${thinking ? -3 : state.gaze * 6}px`, '--gaze-y': thinking ? '-6px' : '0px' } as CSSProperties}>
    <svg viewBox="0 0 420 470" role="img" aria-label={`FLOW Buddy ${labels[state.pose]}`}>
      <defs>
        <linearGradient id={`${id}-shell`} x1="0" y1="0" x2=".8" y2="1"><stop stopColor="#fff" /><stop offset=".36" stopColor="#f1f0fa" /><stop offset=".72" stopColor="#d1dce0" /><stop offset="1" stopColor="#f7fffa" /></linearGradient>
        <linearGradient id={`${id}-metal`} x2="1" y2=".8"><stop stopColor="#111f24" /><stop offset=".5" stopColor="#45545a" /><stop offset="1" stopColor="#0b1418" /></linearGradient>
        <linearGradient id={`${id}-glass`} x1=".1" x2=".8" y2="1"><stop stopColor="#283940" /><stop offset=".4" stopColor="#0b161b" /><stop offset="1" stopColor="#122b28" /></linearGradient>
        <radialGradient id={`${id}-eye`} cx=".35" cy=".35" r=".8"><stop stopColor="#e4fff0" /><stop offset=".55" stopColor="#a1ffd0" /><stop offset="1" stopColor="var(--buddy-accent)" /></radialGradient>
        <radialGradient id={`${id}-shade`}><stop stopColor="#193b32" stopOpacity=".25" /><stop offset="1" stopColor="#193b32" stopOpacity="0" /></radialGradient>
        <linearGradient id={`${id}-accent`} x2=".7" y2="1"><stop stopColor="#e1fff0" /><stop offset=".4" stopColor="var(--buddy-accent)" /><stop offset="1" stopColor="#278764" /></linearGradient>
      </defs>
      <ellipse className="buddy-ground-shadow" cx="210" cy="437" rx="108" ry="18" fill={`url(#${id}-shade)`} />
      <g className="buddy-body-float">
        {/* Feet, knee joints and separately shaped leg casings. */}
        {[175, 246].map((x, i) => <g key={x} transform={`translate(${x} 339) rotate(${i ? -3 : 3})`}>
          <circle cy="9" r="19" fill={metal} /><path d="M-22 4Q0 14 22 4L23 39Q0 54-22 39Z" fill={shell} stroke="#a9bdb9" />
          <circle cy="46" r="13" fill={metal} /><rect x="-8" y="36" width="16" height="23" rx="5" fill={`url(#${id}-accent)`} />
          <path d="M-22 54Q0 65 23 53L31 85Q7 105-29 89Z" fill={shell} stroke="#a5bab5" />
          <path d="M-29 80Q-8 68 17 78Q30 80 32 94Q3 109-34 96Z" fill={shell} stroke="#a2b8b0" />
          <path d="M-34 94Q-3 104 32 93L33 101Q0 113-35 102Z" fill={`url(#${id}-accent)`} />
          <path d="M-17 98H9" stroke="#c5ffe5" strokeWidth="4" strokeLinecap="round" />
        </g>)}
        <rect x="173" y="312" width="76" height="44" rx="20" fill={metal} />
        <path d="M177 326Q211 337 245 326L235 352Q211 365 185 350Z" fill={`url(#${id}-accent)`} />
        {/* Shoulders, elbows, wrists: each rotation has its own local origin. */}
        {[false, true].map(right => <g key={String(right)} transform={`translate(${right ? 274 : 147} 260)`}>
          <g className={`buddy-shoulder ${right ? 'buddy-shoulder-right' : 'buddy-shoulder-left'}`}>
            <circle r="19" fill={metal} /><circle r="15" fill={`url(#${id}-accent)`} />
            <g transform={`rotate(${right ? -35 : 35})`}>
              <path d="M-17-2Q0-15 17-2L15 37Q0 49-15 36Z" fill={shell} stroke="#a1b6b4" /><path d="M-12 1Q0-8 12 1" stroke="var(--buddy-accent)" strokeWidth="5" fill="none" />
              <g transform="translate(0 44)"><g className={`buddy-elbow ${right ? 'buddy-elbow-right' : 'buddy-elbow-left'}`}>
                <circle r="11" fill={metal} /><path d="M-14 2Q0-7 14 2L17 38Q0 49-16 38Z" fill={shell} stroke="#9eb6b0" /><path d="M-10 10L-10 29" stroke="var(--buddy-accent)" strokeWidth="5" strokeLinecap="round" />
                <g transform="translate(0 45)"><Hand right={right} shell={shell} metal={metal} /></g>
              </g></g>
            </g>
          </g>
        </g>)}
        <path d="M164 245Q210 227 256 245L265 284Q252 329 226 342H198Q170 331 157 287Z" fill={shell} stroke="#a5bab5" strokeWidth="1.5" />
        <path d="M175 243Q210 257 246 242L237 258H185Z" fill={`url(#${id}-accent)`} stroke="#89b6a1" />
        <path d="M169 285L181 295L188 319M253 285L242 297L235 320" fill="none" stroke="var(--buddy-accent)" strokeWidth="5" strokeLinecap="round" />
        <rect x="186" y="268" width="53" height="50" rx="18" fill={metal} stroke="var(--buddy-accent)" strokeWidth="2" />
        <g className={appearance.pulse ? 'buddy-chest-pulse' : ''} style={{ color: 'var(--buddy-accent)' }}><Leaf x={212} y={289} scale={0.47} /></g>
        <text x="212" y="309" textAnchor="middle" fill="#c1ffdf" fontSize="8" fontWeight="700" letterSpacing="1.8">FLOW</text>
        {appearance.badge && <path d="M246 260l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z" fill="#f8d277" />}
        <rect x="192" y="216" width="40" height="28" rx="10" fill={metal} />
        <g className="buddy-head">
          <g className="buddy-antenna"><path d="M302 104L311 46" stroke={metal} strokeWidth="7" /><circle cx="312" cy="42" r="10" fill={`url(#${id}-accent)`} stroke="#d9ffee" strokeWidth="2" />{appearance.antenna && <g style={{ color: 'var(--buddy-accent)' }}><Leaf x={312} y={33} scale={0.5} /></g>}</g>
          <ellipse cx="102" cy="151" rx="21" ry="43" fill={metal} /><ellipse cx="99" cy="148" rx="18" ry="41" fill={shell} /><ellipse cx="95" cy="148" rx="10" ry="28" fill={`url(#${id}-accent)`} stroke="#b6ffdc" strokeWidth="2" />
          <ellipse cx="319" cy="150" rx="21" ry="42" fill={metal} /><ellipse cx="322" cy="147" rx="18" ry="40" fill={shell} /><ellipse cx="326" cy="147" rx="10" ry="27" fill={`url(#${id}-accent)`} stroke="#b6ffdc" strokeWidth="2" />
          <path d="M103 143C103 71 136 49 210 49C285 49 319 84 319 145L315 175Q310 225 259 229L158 228Q104 222 103 171Z" fill={shell} stroke="#b1c7c1" strokeWidth="1.5" />
          <path d="M143 70Q170 48 210 49Q251 47 276 70L260 91Q213 99 165 90Z" fill={`url(#${id}-accent)`} stroke="#a4cbbb" />
          <g style={{ color: '#effff8' }}><Leaf x={210} y={71} scale={0.36} /></g>
          <path d="M118 143Q122 103 157 100Q178 96 196 104Q210 111 227 102Q264 88 289 111Q307 128 303 165Q304 207 272 211Q213 222 154 211Q119 205 118 172Z" fill={`url(#${id}-glass)`} stroke="#627974" strokeWidth="2" />
          <path d="M126 134Q138 107 164 108Q183 107 197 114Q212 121 232 110Q269 98 289 124Q252 113 229 128Q194 148 126 134Z" fill="#fff" opacity=".055" />
          <g className="buddy-brows" fill="none" stroke="var(--buddy-accent)" strokeWidth="5" strokeLinecap="round">
            <path className="buddy-brow-left" d={thinking ? 'M145 120Q161 125 178 117' : 'M145 121Q159 108 177 115'} />
            <path className="buddy-brow-right" d={thinking ? 'M247 114Q266 103 278 115' : 'M247 115Q264 106 278 120'} />
          </g>
          <g className={`buddy-eyes ${state.blink ? 'buddy-eyes-blink' : ''}`}>
            {[164, 262].map((x, i) => <g key={x} transform={`translate(${x} 151)`}><g className={`buddy-eye buddy-eye-${i}`}>
              <path d="M-25 8C-26-12-14-27 0-27C18-27 29-10 25 9Q23 24 0 24Q-22 24-25 8Z" fill={`url(#${id}-eye)`} stroke="#38ae83" strokeWidth="1.2" />
              <g className={`buddy-pupil buddy-pupil-${i}`}><ellipse cx="5" cy="-1" rx="15" ry="22" fill="#06251e" /><ellipse cx="2" cy="-10" rx="5.5" ry="7" fill="#f4fff7" transform="rotate(-25 2 -10)" /><circle cx="12" cy="3" r="2" fill="#b4ffdb" /></g>
            </g></g>)}
          </g>
          <g stroke="var(--buddy-accent)" strokeWidth="3" strokeLinecap="round" opacity=".9"><path d="M139 187l-3 5m12-3-3 5m132-6 3 5m6-8 3 5" /></g>
          <g className="buddy-mouth"><path d={mouth} fill={excited || surprised ? 'var(--buddy-accent)' : 'none'} stroke="#b0ffda" strokeWidth="3" strokeLinecap="round" /><path className="buddy-mouth-talking" d="M199 174Q213 178 227 174Q228 198 213 198Q199 198 199 174Z" fill="var(--buddy-accent)" /></g>
          <path d="M137 216Q209 235 284 216" stroke="#fff" strokeOpacity=".55" strokeWidth="3" fill="none" />
        </g>
        {/* One finite timeline signals completion; reduced motion also emits its end event. */}
        {state.gesture && <g key={state.generation} className={`buddy-gesture-clock buddy-clock-${state.gesture}`} onAnimationEnd={(e) => { if (e.target === e.currentTarget) onGestureEnd?.(state.generation); }}><circle cx="210" cy="294" r="1" fill="transparent" /></g>}
        {state.pose === 'celebrating' && <g className="buddy-sparkles" fill="var(--buddy-accent)">{[0, 1, 2, 3, 4, 5].map(i => <path key={i} style={{ '--particle': i } as CSSProperties} d={`M${65 + i * 58} ${70 + (i % 2) * 120}l3 8 8 3-8 3-3 8-3-8-8-3 8-3Z`} />)}</g>}
      </g>
    </svg>
  </div>;
});
