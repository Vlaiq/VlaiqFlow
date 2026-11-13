import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';
import {
  AlertCircle,
  Check,
  ChevronDown,
  ExternalLink,
  Info,
  LoaderCircle,
  Moon,
  Sun,
} from 'lucide-react';
import { useTheme } from '../../app/theme';
import './ui.css';

const classes = (...values: Array<string | false | undefined>) => values.filter(Boolean).join(' ');
type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'danger';
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
  size?: 'normal' | 'small';
}
export const AppButton = forwardRef<HTMLButtonElement, ButtonProps>(function AppButton(
  { variant = 'primary', loading, size = 'normal', className, children, disabled, ...props },
  ref,
) {
  return (
    <button
      {...props}
      ref={ref}
      type={props.type ?? 'button'}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={classes(
        'app-button',
        `app-button-${variant}`,
        size === 'small' && 'app-button-small',
        className,
      )}
    >
      {loading && <LoaderCircle className="app-spinner" size={18} aria-hidden="true" />}
      {children}
    </button>
  );
});
export const IconButton = forwardRef<HTMLButtonElement, ButtonProps & { label: string }>(
  function IconButton({ label, className, children, variant = 'secondary', ...props }, ref) {
    return (
      <AppButton
        {...props}
        ref={ref}
        variant={variant}
        className={classes('app-icon-button', className)}
        aria-label={label}
        title={props.title ?? label}
      >
        {children}
      </AppButton>
    );
  },
);
export function AppCard({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section {...props} className={classes('app-card', className)} />;
}
export const Card = AppCard;
export function FloatingPanel({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <AppCard {...props} className={classes('app-floating-panel', className)} />;
}
export function BottomSheet({
  title,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLElement> & { title: string }) {
  const id = useId();
  return (
    <section {...props} aria-labelledby={id} className={classes('app-bottom-sheet', className)}>
      <div className="app-sheet-handle" aria-hidden="true" />
      <h2 id={id}>{title}</h2>
      {children}
    </section>
  );
}
export const AppInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function AppInput({ className, ...props }, ref) {
    return <input {...props} ref={ref} className={classes('app-input', className)} />;
  },
);
export const AppSelect = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function AppSelect({ className, children, ...props }, ref) {
    return (
      <select {...props} ref={ref} className={classes('app-input', 'app-select', className)}>
        {children}
      </select>
    );
  },
);

export function AppTabs({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string; disabled?: boolean }>;
  label: string;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const move = (index: number, key: string) => {
    const enabled = options.map((o, i) => (!o.disabled ? i : -1)).filter((i) => i >= 0);
    const next =
      key === 'Home'
        ? enabled[0]
        : key === 'End'
          ? enabled.at(-1)
          : enabled[
              (enabled.indexOf(index) + (key === 'ArrowRight' ? 1 : enabled.length - 1)) %
                enabled.length
            ];
    if (next != null) {
      onChange(options[next]!.value);
      refs.current[next]?.focus();
    }
  };
  return (
    <div className="app-tabs" role="tablist" aria-label={label}>
      {options.map((option, index) => (
        <button
          key={option.value}
          ref={(element) => {
            refs.current[index] = element;
          }}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          tabIndex={value === option.value ? 0 : -1}
          disabled={option.disabled}
          onClick={() => onChange(option.value)}
          onKeyDown={(event) => {
            if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
              event.preventDefault();
              move(index, event.key);
            }
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
export const SegmentedControl = AppTabs;
export function StatDisplay({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: ReactNode;
  detail?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="app-stat">
      <span>
        {icon}
        {label}
      </span>
      <strong>{value}</strong>
      {detail && <small>{detail}</small>}
    </div>
  );
}
export function LoadingSkeleton({
  label = 'Se încarcă…',
  rows = 3,
}: {
  label?: string;
  rows?: number;
}) {
  return (
    <div role="status" aria-label={label} className="app-skeleton">
      {Array.from({ length: rows }, (_, index) => (
        <span key={index} aria-hidden="true" />
      ))}
      <span className="app-sr-only">{label}</span>
    </div>
  );
}
export function EmptyState({
  title,
  description,
  icon,
  action,
}: {
  title: string;
  description: string;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="app-empty-state">
      {icon && <span className="app-state-icon">{icon}</span>}
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function ErrorState({
  title = 'Nu am putut încărca datele',
  description,
  onRetry,
}: {
  title?: string;
  description: string;
  onRetry?: () => void;
}) {
  return (
    <div role="alert" className="app-error-state">
      <AlertCircle size={20} aria-hidden="true" />
      <div>
        <h3>{title}</h3>
        <p>{description}</p>
        {onRetry && (
          <AppButton variant="secondary" size="small" onClick={onRetry}>
            Încearcă din nou
          </AppButton>
        )}
      </div>
    </div>
  );
}
const qualityLabels = {
  confirmed: 'Confirmat',
  estimated: 'Estimat',
  unknown: 'Necunoscut',
  simulated: 'DEMO',
} as const;
export function QualityIndicator({
  quality,
  children,
}: {
  quality: keyof typeof qualityLabels;
  children?: ReactNode;
}) {
  return (
    <span className={`app-quality app-quality-${quality}`}>
      {quality === 'confirmed' ? (
        <Check size={12} aria-hidden="true" />
      ) : (
        <Info size={12} aria-hidden="true" />
      )}
      {children ?? qualityLabels[quality]}
    </span>
  );
}
export function DataSourceInfo({
  source,
  updatedAt,
  quality = 'unknown',
  url,
  children,
}: {
  source: string;
  updatedAt?: string | number | null;
  quality?: keyof typeof qualityLabels;
  url?: string;
  children?: ReactNode;
}) {
  const timestamp = updatedAt ? new Date(updatedAt) : null;
  const date =
    timestamp && Number.isFinite(timestamp.valueOf())
      ? timestamp.toLocaleDateString('ro-RO', { day: 'numeric', month: 'long', year: 'numeric' })
      : 'Data actualizării nu este disponibilă';
  return (
    <details className="app-source-info">
      <summary>
        <Info size={15} aria-hidden="true" /> Date și sursă{' '}
        <ChevronDown size={14} aria-hidden="true" />
      </summary>
      <div>
        <QualityIndicator quality={quality} />
        <p>{source}</p>
        <small>{date}</small>
        {url && (
          <a href={url} rel="noreferrer" target="_blank">
            Deschide sursa <ExternalLink size={13} aria-hidden="true" />
          </a>
        )}
        {children}
      </div>
    </details>
  );
}
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirmă',
  cancelLabel = 'Renunță',
  onConfirm,
  onCancel,
  danger = false,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    cancel = useRef<HTMLButtonElement>(null),
    id = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      cancel.current?.focus();
    } else if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="app-confirm-dialog"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-description`}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <h2 id={`${id}-title`}>{title}</h2>
      <p id={`${id}-description`}>{description}</p>
      <div>
        <AppButton ref={cancel} variant="secondary" onClick={onCancel}>
          {cancelLabel}
        </AppButton>
        <AppButton variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>
          {confirmLabel}
        </AppButton>
      </div>
    </dialog>
  );
}
export function AppTooltip({ text, children }: { text: string; children: ReactNode }) {
  return (
    <span className="app-tooltip" title={text}>
      {children}
      <span role="tooltip">{text}</span>
    </span>
  );
}
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();
  return (
    <IconButton
      label={theme === 'dark' ? 'Activează tema Mist Day' : 'Activează tema Forest Night'}
      onClick={toggleTheme}
      className={className}
    >
      {theme === 'dark' ? (
        <Sun size={19} aria-hidden="true" />
      ) : (
        <Moon size={19} aria-hidden="true" />
      )}
    </IconButton>
  );
}
export function MotionProgress({
  value,
  max = 100,
  label,
}: {
  value: number;
  max?: number;
  label: string;
}) {
  const percent = Math.max(0, Math.min(100, max > 0 ? (value / max) * 100 : 0));
  return (
    <div
      className="app-progress"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(max, Math.max(0, value))}
      aria-label={label}
    >
      <span style={{ width: `${percent}%` }} />
    </div>
  );
}
