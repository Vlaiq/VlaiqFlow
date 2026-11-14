// SYNTHETIC BROWSER TEST HARNESS. Not imported or shipped by the application build.
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Destination } from '@vlaiq/shared';
import { useFlowPlanner } from './src/features/voice/useFlowPlanner';
import { GreenSwitch, type JourneyMapSelection } from './src/features/journey/GreenSwitch';
import { MapView } from './src/features/map/MapView';
import type { Origin } from './src/features/parking/ParkingDetail';
import { DEFAULT_PARKING_SETTINGS } from './src/features/parking/settings';
import './src/styles/index.css';
const place = (id: string, name: string, lng: number): Destination => ({
  id,
  name,
  nameEn: null,
  aliases: [],
  kind: 'place',
  detail: 'SYNTHETIC TEST',
  category: null,
  location: { lng, lat: 45.7537 },
  precision: 'exact',
  locationSource: 'SYNTHETIC TEST',
});
const places = [
  place('origin', 'Gara de test', 21.207),
  place('destination', 'Piața de test', 21.2257),
  place('ambiguous-a', 'Biblioteca de test A', 21.22),
  place('ambiguous-b', 'Biblioteca de test B', 21.23),
];
function Harness() {
  const [origin, setOrigin] = useState<Origin | null>(null);
  const [destination, setDestination] = useState<Destination | null>(null);
  const [settings, setSettings] = useState(DEFAULT_PARKING_SETTINGS);
  const [journey, showJourney] = useState<JourneyMapSelection | null>(null);
  const [mapEnabled, setMapEnabled] = useState(true);
  const planner = useFlowPlanner({
    origin,
    destination,
    places,
    settings,
    demo: true,
    setOrigin,
    setDestination,
    setSettings,
    showJourney,
  });
  useEffect(() => {
    Object.assign(window, {
      flowHarness: {
        begin: planner.begin,
        call: (name: Parameters<typeof planner.tools.call>[0], input: unknown) =>
          planner.tools.call(name, input).then(JSON.parse),
        end: () => planner.tools.end(),
        context: { origin, destination, settings },
      },
    });
  });
  return (
    <>
      <h1>SYNTHETIC FLOW VOICE TEST</h1>
      <button
        onClick={() => {
          planner.changed();
          setSettings((s) => ({ ...s, maxWalkMinutes: 7 }));
        }}
      >
        Manual limit 7
      </button>
      <button
        onClick={() => {
          planner.changed();
          setDestination(places[2]!);
        }}
      >
        Manual destination
      </button>
      <button onClick={() => setMapEnabled(!mapEnabled)}>Toggle map</button>
      <div style={{ position: 'relative', height: 300 }}>
        {mapEnabled && (
          <MapView
            parkings={[]}
            timpark={null}
            destination={destination}
            journey={journey}
            onJourneyRendered={planner.acknowledge}
          />
        )}
      </div>
      {destination && (
        <GreenSwitch
          result={planner.result}
          preference={planner.preference}
          onPreference={planner.onPreference}
          selectedId={planner.selectedId}
          onSelect={planner.onSelect}
          onRetry={planner.retry}
          comparisonId={planner.comparisonId}
          origin={origin?.coordinate ?? null}
          destination={destination}
          parkingSettings={settings}
          onJourney={showJourney}
          onStartActivity={() => {}}
        />
      )}
    </>
  );
}
createRoot(document.getElementById('root')!).render(<Harness />);
