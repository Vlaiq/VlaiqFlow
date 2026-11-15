import { memo, useId } from 'react';
import type { CityOutcome } from '../../../../shared/src/buddy/city';

const lots = [
  { x: 234, y: 230, label: 'A · Centru', id: 'a' },
  { x: 464, y: 151, label: 'B · Parc', id: 'b' },
  { x: 506, y: 295, label: 'C · Cartier', id: 'c' },
];
function Building({
  x,
  y,
  w,
  h,
  tone,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  tone: string;
}) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path
        d={`M0 0L${w} ${w * 0.5}L0 ${w}L${-w} ${w * 0.5}Z`}
        fill="#143c3222"
        transform="translate(8 8)"
      />
      <path d={`M0 ${-h}L${w} ${w * 0.5 - h}V${w * 0.5}L0 ${w}Z`} fill={tone} />
      <path
        d={`M0 ${-h}L${-w} ${w * 0.5 - h}V${w * 0.5}L0 ${w}Z`}
        fill={tone}
        style={{ filter: 'brightness(.8)' }}
      />
      <path d={`M0 ${-h}L${w} ${w * 0.5 - h}L0 ${w - h}L${-w} ${w * 0.5 - h}Z`} fill="#eff1df" />
      <path
        d={`M0 ${-h + 5}L${w - 9} ${w * 0.5 - h + 2}L0 ${w - h - 5}L${-w + 9} ${w * 0.5 - h + 2}Z`}
        fill="#b4d5c2"
      />
      {[0, 1, 2].map((i) => (
        <path
          key={i}
          d={`M7 ${w * 0.65 - h + 12 + i * 12}l${w * 0.56} ${-w * 0.27}v6L7 ${w * 0.65 - h + 18 + i * 12}Z`}
          fill="#f1ffe7"
          opacity=".7"
        />
      ))}
    </g>
  );
}
function Tree({ x, y, size = 1 }: { x: number; y: number; size?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${size})`}>
      <ellipse cy="5" rx="15" ry="7" fill="#1c5a3330" />
      <path d="M0-13V3" stroke="#725f42" strokeWidth="4" />
      <ellipse cy="-22" rx="13" ry="18" fill="#4d9877" />
      <ellipse cx="-3" cy="-26" rx="9" ry="13" fill="#81c49d" />
    </g>
  );
}
export const BuddyCity = memo(function BuddyCity({
  outcome,
  comparison,
}: {
  outcome: CityOutcome;
  comparison: 'before' | 'after';
}) {
  const id = useId().replace(/:/g, '');
  const parking = outcome.allocations;
  const destinations = parking.flatMap((lot, i) =>
    Array.from({ length: lot.occupied }, (_, j) => ({
      x: lots[i]!.x - 30 + (j % 4) * 14 + Math.floor(j / 4) * 7,
      y: lots[i]!.y - 4 + (j % 4) * 7 - Math.floor(j / 4) * 10,
    })),
  );
  return (
    <div className="buddy-city-art" data-comparison={comparison}>
      <svg viewBox="0 0 800 420" role="img" aria-labelledby={`${id}-title ${id}-desc`}>
        <title id={`${id}-title`}>
          Oraș virtual · {comparison === 'before' ? 'situația inițială' : 'strategia aleasă'}
        </title>
        <desc id={`${id}-desc`}>
          {outcome.assigned} mașini parcate; {outcome.transitPassengers} persoane cu autobuz
          virtual.{' '}
          {parking.map((l) => `${l.name}: ${l.occupied} din ${l.capacity} locuri`).join('. ')}.{' '}
          {outcome.unassigned} șoferi fără loc în model.
        </desc>
        <defs>
          <linearGradient id={`${id}-ground`} x2="1" y2="1">
            <stop stopColor="#d9edcf" />
            <stop offset="1" stopColor="#abcdb0" />
          </linearGradient>
        </defs>
        <ellipse cx="400" cy="323" rx="290" ry="69" fill="#082c2412" />
        <path d="M60 217L400 35L740 217V237L400 419L60 237Z" fill="#77a48a" />
        <path d="M60 217L400 35L740 217L400 399Z" fill={`url(#${id}-ground)`} />
        <path d="M76 218L400 44L724 218L400 390Z" fill="none" stroke="#effbdc" strokeWidth="2" />
        {/* A compact street network and crossing; all positions are illustrative. */}
        <path
          d="M146 172L629 302M250 320L559 106"
          fill="none"
          stroke="#d9e1cd"
          strokeWidth="47"
          strokeLinejoin="round"
        />
        <path d="M146 172L629 302M250 320L559 106" fill="none" stroke="#7d9691" strokeWidth="32" />
        <path
          d="M146 172L629 302M250 320L559 106"
          fill="none"
          stroke="#e5eee1"
          strokeWidth="1.5"
          strokeDasharray="8 10"
        />
        <path d="M133 184L617 314" stroke="#77b99a" strokeWidth="5" fill="none" />
        <path
          d="M369 233l23 6m-16-13 23 6m-16-13 23 6m-16-13 23 6"
          stroke="#edf3e4"
          strokeWidth="4"
        />
        <path
          d="M527 206Q593 181 621 207Q650 237 675 231"
          stroke="#8bc4d4"
          strokeWidth="15"
          fill="none"
        />
        <path d="M528 201Q593 176 622 202" stroke="#c3e6e7" strokeWidth="2" fill="none" />
        <Building x={323} y={122} w={36} h={60} tone="#c6c6ad" />
        <Building x={391} y={87} w={27} h={42} tone="#a2c9bc" />
        <Building x={543} y={210} w={38} h={55} tone="#bbcec7" />
        <Building x={352} y={307} w={36} h={62} tone="#d7c9b0" />
        <Building x={442} y={339} w={30} h={43} tone="#a8c6c5" />
        <Building x={205} y={174} w={25} h={35} tone="#bdd1bd" />
        {lots.map((l, i) => (
          <g key={l.id}>
            <path
              d={`M${l.x - 56} ${l.y - 15}l63-34 62 32-63 35Z`}
              fill="#dce7d7"
              stroke="#a7bdb2"
            />
            {Array.from({ length: 4 }, (_, j) => (
              <path
                key={j}
                d={`M${l.x - 34 + j * 14} ${l.y - 17 + j * 7}l20-12`}
                fill="none"
                stroke="#fffef2"
                strokeWidth="2"
              />
            ))}
            <rect x={l.x - 39} y={l.y - 62} width="88" height="23" rx="8" fill="#153e32" />
            <text
              x={l.x + 5}
              y={l.y - 47}
              textAnchor="middle"
              fill="#effff3"
              fontSize="11"
              fontWeight="600"
            >
              {l.label} · {parking[i]?.occupied ?? 0}
            </text>
            <path d={`M${l.x + 2} ${l.y - 39}v12`} stroke="#41665a" strokeWidth="2" />
          </g>
        ))}
        {[
          [155, 225],
          [172, 245],
          [220, 278],
          [284, 133],
          [273, 116],
          [452, 112],
          [476, 96],
          [577, 283],
          [608, 266],
          [638, 248],
          [309, 332],
          [373, 360],
          [399, 370],
          [644, 202],
        ].map(([x, y], i) => (
          <Tree key={i} x={x!} y={y!} size={i % 3 === 0 ? 1.15 : 0.85} />
        ))}
        {/* 30 bounded vehicle nodes, repositioned by real deterministic result allocations. */}
        {Array.from({ length: 30 }, (_, i) => {
          const p = destinations[i];
          const active = i < outcome.assigned;
          return (
            <g
              key={i}
              className="buddy-city-car"
              style={{
                transform: `translate(${p?.x ?? 170 + i * 12}px, ${p?.y ?? 179 + i * 3.2}px) rotate(28deg)`,
                opacity: active ? 1 : 0,
              }}
            >
              <ellipse cy="4" rx="7" ry="3" fill="#18352e30" />
              <rect
                x="-6"
                y="-4"
                width="12"
                height="7"
                rx="2"
                fill={['#437e72', '#f1ddad', '#75b8ae', '#d0e5df'][i % 4]}
              />
              <rect x="-2" y="-4.7" width="5" height="5" rx="1.5" fill="#e3f6e9" />
              <path d="M-4 3h2m5 0h2" stroke="#183c34" strokeWidth="2" />
            </g>
          );
        })}
        {outcome.transitPassengers > 0 && (
          <g className="buddy-city-bus" transform="translate(446 255) rotate(27)">
            <rect x="-24" y="-8" width="48" height="16" rx="5" fill="#1b9268" />
            <path d="M-16-5h28v7h-28Z" fill="#d2faea" />
            <path d="M-16 8h5m20 0h5" stroke="#203e34" strokeWidth="4" />
          </g>
        )}
        <g transform="translate(335 188)">
          <circle cy="-8" r="3" fill="#d8b38c" />
          <path
            d="M0-4v8m0-5-4 5m4-4 4 3m-4 1-3 7m3-7 3 6"
            stroke="#205e4c"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </g>
        <g transform="translate(320 224)">
          <circle cx="-6" cy="4" r="5" fill="none" stroke="#306f58" strokeWidth="1.5" />
          <circle cx="8" cy="4" r="5" fill="none" stroke="#306f58" strokeWidth="1.5" />
          <path d="M-6 4L0-3 8 4H-6m6-7-1-5" stroke="#63ad86" fill="none" strokeWidth="2" />
          <circle cx="-1" cy="-13" r="3" fill="#c9a780" />
        </g>
      </svg>
    </div>
  );
});
