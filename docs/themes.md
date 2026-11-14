# Shared themes and Motion integration

The shared semantic palette lives in `frontend/src/styles/tokens.css`. Existing RGB
channel variables remain compatible with Tailwind (`bg-surface`, `text-muted`, and
opacity utilities). UI components and Motion use the same `--app-*` semantic aliases.
The original metallic FLOW Coin SVG keeps its own artwork palette; only its grounded
shadow adapts to the surrounding theme. No trackers or externally hosted theme assets are used. Sprint 01 self-hosts Inter and Manrope
Latin/Latin Extended variable subsets with swap and system fallbacks; original SIL OFL notices
are distributed in `/licenses`. See `docs/complete-journeys.md`.

## Themes

- **Forest Night:** deep forest surfaces, ivory text and pale mint emphasis.
- **Mist Day:** warm near-white surfaces, forest text and a darker accessible green action.

Wrap the app once in `ThemeProvider` from `frontend/src/app/theme.tsx`.
`useTheme()` returns `theme`, `setTheme`, `toggleTheme`, and `useSystemTheme`.
`ThemeToggle` is exported from `frontend/src/components/ui`.

The initial theme follows the system if the browser has no explicit preference. A
selection is stored under `vlaiq.theme` in localStorage, with a safe in-memory fallback
when storage is unavailable. System changes are followed until a user chooses a theme.
Preferences are synchronized across browser tabs. The provider updates the HTML theme
attribute and mobile `theme-color` meta tag before paint. Map consumers should use
`theme` to choose a matching licensed provider style; the semantic CSS handles controls,
panels and popups. Theme switching does not initialize a new activity or ask for GPS.

## Reusable components

`frontend/src/components/ui/index.tsx` exports:

- AppButton / IconButton: consistent touch targets, focus, loading and disabled states.
- AppCard (Card), FloatingPanel and BottomSheet.
- AppInput / AppSelect; AppTabs (SegmentedControl) with keyboard arrow/Home/End navigation.
- StatDisplay, LoadingSkeleton, EmptyState, ErrorState.
- QualityIndicator and native progressive-disclosure DataSourceInfo.
- ConfirmDialog: controlled native modal with keyboard focus containment and Escape handling.
- AppTooltip, ThemeToggle and MotionProgress.

Use semantic colors for future screens, not a second page-specific palette. Reduced
motion removes transitions and decorative loops; meaning and final amounts remain visible.

## Motion inside the shared shell

`MotionScreen` supports these optional props:

```ts
{
  embedded?: boolean;
  tab?: 'home' | 'missions' | 'wallet' | 'league';
  onTabChange?: (tab: MotionTab) => void;
  onActivityChange?: (active: boolean) => void;
  onWalletChange?: (balance: number) => void;
  initialMode?: 'walk' | 'run' | 'cycle';
}
```

Embedded mode removes Motion's extra header, bottom navigation and standalone leave link.
Keep its component mounted when the user visits another main section. Controlled tabs
can display the wallet or missions while the same GPS/activity hooks keep their state;
a visible “Revino la activitate” action restores the session screen. Initial mode only
preselects the activity type. It never starts GPS automatically and does not override an
ongoing session. Completed summaries can be reopened until explicitly dismissed.

`onActivityChange(true)` includes acquisition, recording, pause and submission. The shell
can expose a return-to-session control. `onWalletChange` and the custom event
`vlaiq-wallet-updated` carry only the server wallet balance, never DEMO coins. Give the
shell's wallet control `data-flow-wallet-target` so the reward animation travels to it.
The router should respect prevented clicks and keep navigation inside the same document.

## Verification

`frontend/src/app/theme.test.ts` checks preference resolution and WCAG AA normal-text
contrast (at least 4.5:1) for shared primary/secondary text on all shared surfaces and
primary button text in both themes. This does not replace a full accessibility audit.

Browser QA covered system theme selection, explicit choice, reload persistence,
360/390/430/768/1440 px layouts, both Motion palettes, embedded controlled tabs,
ongoing demo preservation and cancellation cleanup. Screenshots are under
`/workspace/artifacts/theme/` in the current cloud task. Those tests use controlled
browser input and do not validate physical-device GPS or real provider map connectivity.
