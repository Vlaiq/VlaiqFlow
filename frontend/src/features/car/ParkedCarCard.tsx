import { useEffect, useRef, useState } from 'react';
import { Bell, CalendarPlus, Car, Footprints, LoaderCircle, X } from 'lucide-react';
import {
  CompleteJourneyRequest,
  describeSchedule,
  hoursToBuy,
  paymentEnd,
  reminderPlan,
  type Coordinate,
  type NavigationRoute,
  type ParkedCar,
  type TimparkTariffs,
} from '@vlaiq/shared';
import { QualityBadge } from '../../components/QualityBadge';
import { fetchCompleteJourneys } from '../journey/useCompleteJourneys';
import { formatDistance } from '../navigation/geometry';
import { clearCar, updateCar } from './carStore';
import { clock, downloadReminder } from './calendar';
import './car.css';

type Walk =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'ok'; route: NavigationRoute; fromName: string }
  | { state: 'error'; message: string };

interface Props {
  car: ParkedCar;
  /** Published Timpark tariffs, null while they load or when they failed. */
  tariffs: TimparkTariffs | null;
  /** Real walking route to the car, for the map (provider geometry only). */
  onWalkRoute: (geometry: Coordinate[] | null) => void;
}

/**
 * "Mașina ta" (spec §6.17): the saved spot, the real walking route back, and a reminder before the
 * user's own Timpark payment ends. The app does not know whether or how much the user paid: it asks.
 */
export function ParkedCarCard({ car, tariffs, onWalkRoute }: Props) {
  const [now, setNow] = useState(() => new Date());
  const [walk, setWalk] = useState<Walk>({ state: 'idle' });
  const [notify, setNotify] = useState(
    () => typeof Notification !== 'undefined' && Notification.permission === 'granted',
  );
  const request = useRef<AbortController>();
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(t);
  }, []);
  useEffect(
    () => () => {
      request.current?.abort();
      onWalkRoute(null);
    },
    [onWalkRoute],
  );

  const walkMinutes = walk.state === 'ok' ? walk.route.duration / 60 : car.walkMinutes;
  const plan = tariffs ? reminderPlan(car, now, tariffs.schedule, walkMinutes) : null;
  const leaveBy = plan?.state === 'running' ? plan.leaveBy : null;
  const timeToLeave = leaveBy != null && now >= leaveBy;

  // In-app notification while the page is open. Browsers cannot schedule one for a closed web app,
  // so the calendar file is the reliable reminder and we say so.
  useEffect(() => {
    if (!notify || !leaveBy || typeof Notification === 'undefined') return;
    const wait = leaveBy.getTime() - Date.now();
    if (wait < 0 || wait > 12 * 3600_000) return;
    const t = window.setTimeout(() => {
      try {
        new Notification('VLAIQ FLOW · pleacă spre mașină', {
          body: `Plata pentru ${car.name} se termină la ${plan?.state === 'running' ? clock(plan.paidUntil) : ''}.`,
          tag: 'vlaiq-car',
        });
      } catch {
        /* some mobile browsers only allow notifications from a service worker */
      }
      setNow(new Date());
    }, wait);
    return () => window.clearTimeout(t);
  }, [notify, leaveBy?.getTime(), car.name]); // eslint-disable-line react-hooks/exhaustive-deps

  const showWalk = () => {
    request.current?.abort();
    const ctrl = new AbortController();
    request.current = ctrl;
    setWalk({ state: 'loading' });
    const route = (from: Coordinate, fromName: string) =>
      fetchCompleteJourneys(
        CompleteJourneyRequest.parse({ origin: from, destination: car.coordinate, modes: ['walk'] }),
        ctrl.signal,
      ).then((value) => {
        const leg = value.journeys.find((j) => j.category === 'walk')?.legs[0];
        if (!leg || leg.type === 'parking') throw new Error('Ruta pietonală nu este disponibilă acum.');
        if (ctrl.signal.aborted) return;
        setWalk({ state: 'ok', route: leg.route, fromName });
        onWalkRoute(leg.route.geometry);
      });
    const fail = (e: unknown) => {
      if (ctrl.signal.aborted) return;
      setWalk({ state: 'error', message: e instanceof Error ? e.message : 'Ruta pietonală nu este disponibilă acum.' });
      onWalkRoute(null);
    };
    const fromDestination = () =>
      car.destination
        ? route(car.destination.coordinate, car.destination.name).catch(fail)
        : fail(new Error('Fără locație nu știm de unde pornești. Permite Locația și încearcă din nou.'));
    if (!navigator.geolocation || !window.isSecureContext) return void fromDestination();
    navigator.geolocation.getCurrentPosition(
      (p) =>
        p.coords.accuracy > 300
          ? void fromDestination()
          : void route([p.coords.longitude, p.coords.latitude], `locația ta (±${Math.round(p.coords.accuracy)} m)`).catch(fail),
      () => void fromDestination(),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    );
  };

  const paid = (hours: number) => updateCar({ paidUntil: paymentEnd(new Date(), hours).toISOString() });
  const extend = () => {
    if (!car.paidUntil) return;
    const base = Math.max(new Date(car.paidUntil).getTime(), Date.now());
    updateCar({ paidUntil: new Date(base + 3600_000).toISOString() });
  };
  const askNotify = async () => {
    if (typeof Notification === 'undefined') return;
    const result = await Notification.requestPermission().catch(() => 'denied' as const);
    setNotify(result === 'granted');
  };
  const suggested =
    tariffs && car.tariff && car.stayMinutes ? hoursToBuy(car.tariff, now, car.stayMinutes, tariffs.schedule) : null;
  const sms = car.smsCode && tariffs ? `trimite ${car.smsCode} la ${tariffs.smsNumber}` : null;

  return (
    <section className="parked-car" aria-labelledby="parked-car-title">
      <header className="parked-car-head">
        <span className="parked-car-icon" aria-hidden>
          <Car size={18} />
        </span>
        <div>
          <span className="parked-car-eyebrow">MAȘINA TA</span>
          <h2 id="parked-car-title">{car.name}</h2>
          <p>
            Parcată la {clock(new Date(car.parkedAt))}
            {car.destination ? ` · pentru ${car.destination.name}` : ''}. Salvat doar pe acest dispozitiv.
          </p>
        </div>
        <button className="parked-car-close" onClick={clearCar} aria-label="Am plecat cu mașina: șterge locul salvat">
          <X size={17} />
        </button>
      </header>

      {timeToLeave && plan?.state === 'running' && (
        <p className="parked-car-alert" role="alert">
          <Bell size={15} /> E timpul să pleci spre mașină: plata se termină la {clock(plan.paidUntil)}.
        </p>
      )}

      <div className="parked-car-pay">
        {!tariffs && <p>Programul Timpark nu s-a încărcat; nu putem calcula expirarea.</p>}
        {plan?.state === 'not_timpark' && (
          <p>Nu este o parcare Timpark. Prețul și regulile nu le cunoaștem: verifică la fața locului.</p>
        )}
        {plan?.state === 'free_now' && (
          <p>
            Acum nu se plătește Timpark
            {plan.paidFrom ? `; plata începe la ${clock(plan.paidFrom)}` : ' pentru restul zilei'}. {tariffs && describeSchedule(tariffs.schedule)}.
          </p>
        )}
        {plan?.state === 'unpaid' && (
          <>
            <p>
              Program plătit până la {clock(plan.freeFrom)}, apoi gratuit.
              {sms ? ` Plata prin SMS: ${sms}.` : ''}
              {suggested ? ` Pentru șederea ta ajung ${suggested} h.` : ''}
            </p>
            <div className="parked-car-chips" role="group" aria-label="Cât ai plătit?">
              <span>Am plătit:</span>
              {[1, 2, 3].map((h) => (
                <button key={h} onClick={() => paid(h)}>
                  {h} h{suggested === h ? ' · sugerat' : ''}
                </button>
              ))}
            </div>
          </>
        )}
        {plan?.state === 'covered' && (
          <p>
            Plata ta ține până la {clock(plan.paidUntil)}, după sfârșitul programului ({clock(plan.freeFrom)}). Nu mai
            ai nimic de plătit azi.
          </p>
        )}
        {plan?.state === 'running' && (
          <>
            <p>
              <strong>Plata se termină la {clock(plan.paidUntil)}.</strong> Pleacă spre mașină la{' '}
              <strong>{clock(plan.leaveBy)}</strong>
              {walkMinutes != null ? ` (~${Math.max(1, Math.round(walkMinutes))} min pe jos, estimat, + 5 min rezervă)` : ' (5 min rezervă)'}.
            </p>
            <div className="parked-car-chips">
              <button
                onClick={() =>
                  downloadReminder({
                    title: `Pleacă spre mașină (${car.name})`,
                    description: `Plata Timpark se termină la ${clock(plan.paidUntil)}.${sms ? ` Prelungire: ${sms}.` : ''} Ora este calculată de VLAIQ FLOW din ce ai introdus.`,
                    start: plan.leaveBy,
                    location: car.name,
                  })
                }
              >
                <CalendarPlus size={14} /> Adaugă în calendar
              </button>
              {typeof Notification !== 'undefined' && !notify && (
                <button onClick={() => void askNotify()}>
                  <Bell size={14} /> Anunță-mă aici
                </button>
              )}
              <button onClick={extend}>Am prelungit +1 h</button>
            </div>
            {notify && <small>Notificarea apare doar cât timp aplicația e deschisă. Calendarul te anunță oricum.</small>}
          </>
        )}
        {plan?.state === 'expired' && (
          <>
            <p className="parked-car-expired" role="alert">
              Plata introdusă de tine s-a terminat la {clock(plan.paidUntil)}. Programul plătit ține până la{' '}
              {clock(plan.freeFrom)}.{sms ? ` Prelungire: ${sms}.` : ''}
            </p>
            <div className="parked-car-chips">
              <button onClick={extend}>Am prelungit +1 h</button>
            </div>
          </>
        )}
      </div>

      <button className="parked-car-walk" onClick={showWalk} disabled={walk.state === 'loading'}>
        {walk.state === 'loading' ? <LoaderCircle className="spin" size={16} /> : <Footprints size={16} />}
        {walk.state === 'loading' ? 'Calculăm traseul pe jos…' : 'Drumul pe jos până la mașină'}
      </button>
      {walk.state === 'ok' && (
        <p className="parked-car-walk-result">
          De la {walk.fromName}: <strong>~{Math.max(1, Math.round(walk.route.duration / 60))} min</strong>,{' '}
          {formatDistance(walk.route.distance)} <QualityBadge quality={walk.route.quality} /> · {walk.route.source}. Traseul
          e pe hartă.
        </p>
      )}
      {walk.state === 'error' && (
        <p className="parked-car-walk-result" role="alert">
          {walk.message}
        </p>
      )}
    </section>
  );
}
