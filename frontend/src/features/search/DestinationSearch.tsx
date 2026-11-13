import { useId, useMemo, useRef, useState } from 'react';
import { MapPin, Search, X } from 'lucide-react';
import { buildSearchIndex, searchDestinations, type Destination } from '@vlaiq/shared';
import { kindLabel, PRECISION_LABEL } from './labels';

interface Props {
  destinations: Destination[] | null; // null while loading or unavailable
  unavailable: boolean;
  onSelect: (d: Destination) => void;
}

/**
 * Accessible combobox (WAI-ARIA pattern): arrows move, Enter picks, Escape closes.
 * Search runs locally on the City Hall snapshot, so typing makes no network requests.
 */
export function DestinationSearch({ destinations, unavailable, onSelect }: Props) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const index = useMemo(() => (destinations ? buildSearchIndex(destinations) : []), [destinations]);
  const results = useMemo(() => searchDestinations(index, query, 8), [index, query]);
  const showList = open && query.trim().length > 0;

  const pick = (d: Destination) => {
    setQuery(d.name);
    setOpen(false);
    onSelect(d);
    inputRef.current?.blur();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, Math.max(results.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      const d = results[active];
      if (showList && d) {
        e.preventDefault();
        pick(d);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const placeholder = unavailable
    ? 'Căutarea nu e disponibilă acum'
    : destinations
      ? 'Unde mergi? Stradă, piață, obiectiv…'
      : 'Se încarcă străzile…';

  return (
    <div className="relative flex-1">
      <label className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 focus-within:ring-2 focus-within:ring-primary">
        <Search className="h-4 w-4 shrink-0 text-muted" aria-hidden />
        <span className="sr-only">Caută destinația</span>
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showList}
          aria-controls={listId}
          aria-activedescendant={showList && results[active] ? `${listId}-${active}` : undefined}
          disabled={!destinations}
          value={query}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
          className="w-full bg-transparent text-sm text-text placeholder:text-muted focus:outline-none disabled:cursor-not-allowed"
        />
        {query && (
          <button
            type="button"
            aria-label="Șterge căutarea"
            className="rounded p-1 text-muted hover:text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setQuery('');
              inputRef.current?.focus();
            }}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        )}
      </label>

      {showList && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Sugestii de destinații"
          className="absolute inset-x-0 top-full z-30 mt-2 max-h-[min(20rem,calc(100dvh-7rem))] overflow-auto rounded-card border border-border bg-surface py-1 shadow-xl"
        >
          {results.length === 0 && (
            <li className="px-4 py-3 text-sm text-muted" role="presentation">
              Nicio potrivire în registrul de străzi și obiectivele Primăriei.
            </li>
          )}
          {results.map((d, i) => (
            <li
              key={d.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(d)}
              className={`flex cursor-pointer items-start gap-3 px-4 py-2 text-sm ${i === active ? 'bg-surface-2' : ''}`}
            >
              <MapPin className={`mt-0.5 h-4 w-4 shrink-0 ${d.location ? 'text-primary' : 'text-muted'}`} aria-hidden />
              <span className="min-w-0">
                <span className="block truncate text-text">{d.name}</span>
                <span className="block truncate text-xs text-muted">
                  {kindLabel(d)}
                  {d.detail && d.kind !== 'neighbourhood' ? ` · ${d.detail}` : ''}
                  {d.precision !== 'exact' ? ` · ${PRECISION_LABEL[d.precision]}` : ''}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
