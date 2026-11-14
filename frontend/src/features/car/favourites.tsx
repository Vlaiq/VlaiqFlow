import { useEffect, useState } from 'react';
import { Briefcase, GraduationCap, Home, Star } from 'lucide-react';
import type { Destination } from '@vlaiq/shared';
import './car.css';

/**
 * Favourite places (spec §6.22): Acasă / Serviciu / Facultate, one tap as destination or start.
 * Only the id and name of a place from the City Hall / OSM snapshot are kept, in this browser only;
 * the position is always read back from the snapshot, never stored or typed in.
 */
export type FavouriteSlot = 'home' | 'work' | 'study';
type Favourites = Partial<Record<FavouriteSlot, { id: string; name: string }>>;
const KEY = 'vlaiq.favourites.v1';
const EVENT = 'vlaiq-favourites';
export const SLOTS: { id: FavouriteSlot; label: string; Icon: typeof Home }[] = [
  { id: 'home', label: 'Acasă', Icon: Home },
  { id: 'work', label: 'Serviciu', Icon: Briefcase },
  { id: 'study', label: 'Facultate', Icon: GraduationCap },
];

function load(): Favourites {
  try {
    const raw = JSON.parse(window.localStorage.getItem(KEY) ?? '{}') as unknown;
    if (!raw || typeof raw !== 'object') return {};
    const out: Favourites = {};
    for (const { id } of SLOTS) {
      const v = (raw as Record<string, unknown>)[id] as { id?: unknown; name?: unknown } | undefined;
      if (v && typeof v.id === 'string' && typeof v.name === 'string') out[id] = { id: v.id.slice(0, 80), name: v.name.slice(0, 120) };
    }
    return out;
  } catch {
    return {};
  }
}
function store(next: Favourites): boolean {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(EVENT));
    return true;
  } catch {
    return false;
  }
}

export function useFavourites() {
  const [favs, setFavs] = useState<Favourites>(load);
  useEffect(() => {
    const sync = () => setFavs(load());
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  return favs;
}

/** The snapshot record of a favourite, or null when it is gone from the data. */
export function resolveFavourite(fav: { id: string } | undefined, places: Destination[] | null): Destination | null {
  if (!fav || !places) return null;
  return places.find((d) => d.id === fav.id && d.location) ?? null;
}

/** One-tap shortcuts. `verb` tells what a tap does ("Mergi la" or "Plec de la"). */
export function FavouriteShortcuts({
  places,
  onPick,
  verb,
  hideEmpty = false,
}: {
  places: Destination[] | null;
  onPick: (d: Destination, slot: FavouriteSlot) => void;
  verb: string;
  hideEmpty?: boolean;
}) {
  const favs = useFavourites();
  const items = SLOTS.map((s) => ({ ...s, place: resolveFavourite(favs[s.id], places) }));
  if (hideEmpty && items.every((i) => !i.place)) return null;
  return (
    <div className="place-favourites" role="group" aria-label={`${verb}: locuri salvate`}>
      {items.map(({ id, label, Icon, place }) =>
        place ? (
          <button key={id} type="button" onClick={() => onPick(place, id)} title={place.name}>
            <Icon size={14} aria-hidden /> {label}
            <span className="sr-only">: {verb.toLowerCase()} {place.name}</span>
          </button>
        ) : hideEmpty ? null : (
          <button
            key={id}
            type="button"
            className="is-empty"
            onClick={() => document.querySelector<HTMLInputElement>('.explore-search input')?.focus()}
          >
            <Icon size={14} aria-hidden /> {label}
            <span className="sr-only">: încă nesalvat. Caută locul, apoi salvează-l.</span>
          </button>
        ),
      )}
    </div>
  );
}

/** "Salvează ca" for the chosen destination. */
export function SaveFavourite({ place }: { place: Destination }) {
  const favs = useFavourites();
  const [message, setMessage] = useState<string | null>(null);
  if (!place.location) return null;
  return (
    <div className="place-favourites" role="group" aria-label="Salvează destinația">
      <span className="place-favourite-save">
        <Star size={13} aria-hidden /> Salvează ca:
      </span>
      {SLOTS.map(({ id, label, Icon }) => {
        const on = favs[id]?.id === place.id;
        return (
          <button
            key={id}
            type="button"
            aria-pressed={on}
            onClick={() => {
              const next = { ...load() };
              if (on) delete next[id];
              else next[id] = { id: place.id, name: place.name };
              setMessage(
                store(next)
                  ? on
                    ? `${label} a fost șters.`
                    : `${place.name} e salvat ca ${label}, doar pe acest dispozitiv.`
                  : 'Browserul nu permite salvarea.',
              );
            }}
          >
            <Icon size={14} aria-hidden /> {label}
            {on ? ' ✓' : ''}
          </button>
        );
      })}
      {message && (
        <small role="status" style={{ flexBasis: '100%' }}>
          {message}
        </small>
      )}
    </div>
  );
}
