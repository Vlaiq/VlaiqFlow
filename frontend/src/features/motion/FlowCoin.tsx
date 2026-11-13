import { useId, type CSSProperties } from 'react';

interface Props {
  size?: number;
  animated?: boolean;
  interactive?: boolean;
  celebrating?: boolean;
  variant?: 'mint' | 'gold';
}

/** Original SVG relief artwork; no WebGL, external images or animation runtime. */
export function FlowCoin({
  size = 140,
  animated = false,
  interactive = false,
  celebrating = false,
  variant = 'mint',
}: Props) {
  const id = useId().replace(/:/g, '');
  const small = size < 72;
  const art = (
    <svg viewBox="0 0 240 258" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient
          id={`${id}-rim`}
          x1="25"
          y1="20"
          x2="210"
          y2="220"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#f7f8c8" />
          <stop offset=".18" stopColor="#acd78d" />
          <stop offset=".43" stopColor="#356f47" />
          <stop offset=".66" stopColor="#bde6a0" />
          <stop offset=".86" stopColor="#336d45" />
          <stop offset="1" stopColor="#153e2e" />
        </linearGradient>
        <linearGradient
          id={`${id}-face`}
          x1="49"
          y1="30"
          x2="190"
          y2="209"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#f4f4b3" />
          <stop offset=".31" stopColor={variant === 'gold' ? '#dfd688' : '#c4df8d'} />
          <stop offset=".66" stopColor="#84b96b" />
          <stop offset="1" stopColor="#39704b" />
        </linearGradient>
        <linearGradient
          id={`${id}-edge`}
          x1="0"
          y1="100"
          x2="230"
          y2="170"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#142f23" />
          <stop offset=".3" stopColor="#579d66" />
          <stop offset=".6" stopColor="#143b29" />
          <stop offset="1" stopColor="#7dbd76" />
        </linearGradient>
        <linearGradient
          id={`${id}-leaf`}
          x1="80"
          y1="70"
          x2="163"
          y2="177"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#62945b" />
          <stop offset=".5" stopColor="#20583c" />
          <stop offset="1" stopColor="#3d794d" />
        </linearGradient>
        <linearGradient id={`${id}-shine`}>
          <stop stopColor="#ffffed" stopOpacity="0" />
          <stop offset=".5" stopColor="#ffffed" stopOpacity=".35" />
          <stop offset="1" stopColor="#ffffed" stopOpacity="0" />
        </linearGradient>
        <clipPath id={`${id}-clip`}>
          <circle cx="120" cy="119" r="96" />
        </clipPath>
        <path id={`${id}-top`} d="M 40 120 A 80 80 0 0 1 200 120" />
        <path id={`${id}-bottom`} d="M 39 132 A 82 82 0 0 0 201 132" />
      </defs>
      <ellipse
        className="flow-coin-shadow"
        cx="120"
        cy="247"
        rx="75"
        ry="8"
        fill="#030c08"
        opacity=".5"
      />
      <g className="flow-coin-metal">
        <circle cx="120" cy="129" r="109" fill={`url(#${id}-edge)`} />
        <circle
          cx="120"
          cy="119"
          r="109"
          fill={`url(#${id}-rim)`}
          stroke="#77a979"
          strokeWidth="1"
        />
        {!small &&
          Array.from({ length: 64 }, (_, i) => (
            <path
              key={i}
              d="M120 12v6"
              transform={`rotate(${i * 5.625} 120 119)`}
              stroke={i % 2 ? '#28563b' : '#f3efbd'}
              strokeWidth="1.3"
              opacity=".65"
            />
          ))}
        <circle
          cx="120"
          cy="119"
          r="99"
          fill={`url(#${id}-face)`}
          stroke="#ecf5bd"
          strokeWidth="2"
        />
        <circle
          cx="120"
          cy="119"
          r="91"
          fill="none"
          stroke="#3c6c43"
          strokeWidth="1"
          opacity=".65"
        />
        <circle
          cx="120"
          cy="119"
          r="72"
          fill="none"
          stroke="#eff5b3"
          strokeWidth="1"
          opacity=".5"
        />
        <circle
          cx="120"
          cy="120"
          r="70"
          fill="none"
          stroke="#355e3e"
          strokeWidth="1.5"
          opacity=".7"
        />
        {!small && (
          <g
            fill="#315d3e"
            fontFamily="system-ui,sans-serif"
            fontSize="8"
            fontWeight="700"
            letterSpacing="3"
          >
            <text>
              <textPath href={`#${id}-top`} startOffset="50%" textAnchor="middle">
                VLAIQ FLOW
              </textPath>
            </text>
            <text fontSize="6" letterSpacing="2.5">
              <textPath href={`#${id}-bottom`} startOffset="50%" textAnchor="middle">
                MOVE WITH PURPOSE
              </textPath>
            </text>
          </g>
        )}
        <path
          d="M100 157C68 113 108 77 163 70c12 47-1 90-42 93Z"
          fill="#264f33"
          transform="translate(1 3)"
        />
        <path
          d="M100 155C68 111 108 75 163 68c12 47-1 90-42 93Z"
          fill={`url(#${id}-leaf)`}
          stroke="#c9e69a"
          strokeWidth="1.2"
        />
        <path
          d="M96 177c12-39 30-70 54-89M116 132l-25-22M132 110l28-7"
          fill="none"
          stroke="#1b4932"
          strokeWidth="6"
          strokeLinecap="round"
          transform="translate(1 2)"
        />
        <path
          d="M96 175c12-39 30-70 54-89M116 130l-25-22M132 108l28-7"
          fill="none"
          stroke="#e6f4b6"
          strokeWidth="4.5"
          strokeLinecap="round"
        />
        {!small && (
          <g fill="#d9edac" stroke="#3b7048" strokeWidth=".6">
            <path d="m37 116 3-3 3 3-3 3Z" />
            <path d="m197 116 3-3 3 3-3 3Z" />
          </g>
        )}
        <g clipPath={`url(#${id}-clip)`}>
          <rect
            className="flow-coin-reflection"
            x="-90"
            y="0"
            width="70"
            height="250"
            fill={`url(#${id}-shine)`}
            transform="rotate(-25 120 120)"
          />
        </g>
        <path
          d="M31 94A94 94 0 0 1 137 24"
          fill="none"
          stroke="#ffffde"
          strokeWidth="2"
          strokeLinecap="round"
          opacity=".65"
        />
      </g>
    </svg>
  );
  const className = `flow-coin ${animated ? 'coin-idle' : ''} ${celebrating ? 'coin-celebrating' : ''}`;
  const style = { width: size, '--coin-size': `${size}px` } as CSSProperties;
  return interactive ? (
    <button
      type="button"
      className={`${className} coin-interactive`}
      style={style}
      aria-label="Examinează moneda FLOW"
      onPointerMove={(e) => {
        if (e.pointerType !== 'mouse') return;
        const box = e.currentTarget.getBoundingClientRect();
        e.currentTarget.style.setProperty(
          '--coin-tilt',
          `${((e.clientX - box.left) / box.width - 0.5) * 16}deg`,
        );
      }}
      onPointerLeave={(e) => e.currentTarget.style.setProperty('--coin-tilt', '-8deg')}
    >
      {art}
    </button>
  ) : (
    <span
      className={className}
      style={style}
      role="img"
      aria-label="Monedă FLOW, frunză gravată în metal verde-auriu"
    >
      {art}
    </span>
  );
}
