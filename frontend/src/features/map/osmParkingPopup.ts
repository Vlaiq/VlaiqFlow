import { formatAmountRo, type Parking } from '@vlaiq/shared';

const TYPE_LABEL: Record<Parking['type'], string> = {
  surface: 'Parcare la sol',
  'multi-storey': 'Parcare etajată',
  underground: 'Parcare subterană',
  street_zone: 'Parcare pe stradă',
  park_and_ride: 'Park & Ride',
  other: 'Parcare',
};

const ACCESS_LABEL: Record<Parking['access'], string> = {
  public: 'Acces public',
  customers: 'Doar pentru clienți',
  unknown: 'Acces nespecificat',
};

/** Popup content for an OpenStreetMap parking, built with DOM nodes (names are never injected as HTML). */
export function osmParkingPopupContent(p: Parking): HTMLElement {
  const root = document.createElement('div');
  root.className = 'vlaiq-popup';
  const line = (text: string, cls = '') => {
    const el = document.createElement('div');
    if (cls) el.className = cls;
    el.textContent = text;
    root.appendChild(el);
  };

  line(p.name, 'vlaiq-popup-title');
  if (p.nameIsDerived) line('Denumire după poziție (parcarea nu are nume în OSM)', 'vlaiq-popup-muted');
  line(
    `${TYPE_LABEL[p.type]} · ${ACCESS_LABEL[p.access]}${p.operator ? ` · ${p.operator}` : ''}${
      p.neighbourhood ? ` · cartierul ${p.neighbourhood}` : ''
    }`,
  );
  if (p.capacity.value != null) line(`Capacitate: ${p.capacity.value} locuri (estimat, din OSM)`);
  if (p.capacityDisabled.value != null) line(`Locuri pentru persoane cu dizabilități: ${p.capacityDisabled.value} (estimat)`);
  line(
    p.price.value
      ? p.price.value.perHourRon === 0
        ? 'Gratuită, conform OSM (estimat)'
        : `${formatAmountRo(p.price.value.perHourRon)} lei/oră (estimat)`
      : 'Preț: necunoscut',
  );
  line('Locuri libere: necunoscut', 'vlaiq-popup-muted');
  line(`Sursa: ${p.source} · © OpenStreetMap contributors`, 'vlaiq-popup-muted');
  return root;
}
