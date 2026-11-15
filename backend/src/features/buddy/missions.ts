import { randomUUID } from 'node:crypto';
import type {
  BuddyMissionEngine,
  Difficulty,
  MissionId,
  PublicMission,
} from '../../../../shared/src/buddy/contracts';
import { simulateBuddyCity } from '../../../../shared/src/buddy/city';

const definitions: Record<
  Exclude<MissionId, 'city-balance'>,
  {
    title: string;
    question: string;
    hint: string;
    correct: string;
    explanation: string;
    options: [string, string, string][];
  }
> = {
  'green-route': {
    title: 'Ultimul kilometru',
    question:
      'Ai 1 km până la bibliotecă, trotuar sigur, fără bagaje grele și 20 de minute. Ce opțiune evită energia de propulsie a unui vehicul?',
    hint: 'Pentru un drum scurt, gândește-te ce opțiune folosește doar energia corpului.',
    correct: 'walk',
    explanation:
      'Mersul pe jos este potrivit în condițiile descrise. Accesibilitatea, siguranța și nevoile personale pot schimba alegerea.',
    options: [
      ['walk', 'Merg pe jos', 'Trotuar sigur, fără vehicul.'],
      ['car', 'Conduc singur', 'Un drum scurt cu un vehicul.'],
      ['electric', 'Chem o mașină electrică', 'Tot necesită energie pentru vehicul.'],
    ],
  },
  'smart-parking': {
    title: 'Mai puține ture',
    question:
      'Ai informații despre tarife și distanțe, dar nu despre locuri libere. Ce poate spune onest o recomandare de parcare?',
    hint: 'Separă datele cunoscute de o promisiune care ar necesita senzori în timp real.',
    correct: 'compare',
    explanation:
      'Poți compara tarifele și mersul pe jos. O recomandare nu garantează un loc liber fără date de ocupare verificate.',
    options: [
      ['compare', 'Compar costul și mersul pe jos', 'Disponibilitatea rămâne necunoscută.'],
      ['guarantee', 'Garantez un loc liber', 'Doar pentru că parcarea este pe hartă.'],
      ['live', 'Afirm că traficul este măsurat', 'Fără o sursă de trafic.'],
    ],
  },
  energy: {
    title: 'Energia la frânare',
    question: 'Ce face frânarea regenerativă a unui vehicul electric?',
    hint: 'Energia cinetică poate fi convertită; conversia are pierderi.',
    correct: 'recover',
    explanation:
      'Motorul funcționează ca generator și recuperează o parte din energia cinetică. Nu recuperează tot și nu elimină consumul.',
    options: [
      ['recover', 'Recuperează o parte din energie', 'O parte ajunge în baterie.'],
      ['all', 'Recuperează 100%', 'Fără nicio pierdere.'],
      ['create', 'Creează energie nelimitată', 'Bateria nu mai trebuie încărcată.'],
    ],
  },
  'time-tradeoff': {
    title: 'La timp, cu grijă',
    question:
      'În acest exercițiu ai maximum 20 min: mers 24 min, bicicletă pe traseu sigur 16 min, mașină 14 min. Ce alegere respectă timpul fără energie de propulsie pentru un autovehicul?',
    hint: 'Verifică întâi limita de 20 minute, apoi tipul de propulsie. Timpii sunt ipotetici.',
    correct: 'cycle',
    explanation:
      'Bicicleta respectă limita ipotetică de timp și evită propulsia unui autovehicul. Aceste valori sunt un exercițiu, nu rute calculate.',
    options: [
      ['cycle', 'Bicicletă · 16 min', 'Traseu sigur în exercițiu.'],
      ['walk', 'Pe jos · 24 min', 'Peste timpul disponibil.'],
      ['car', 'Mașină · 14 min', 'Respectă timpul, dar folosește propulsie auto.'],
    ],
  },
  misconception: {
    title: 'Dincolo de slogan',
    question: 'Care afirmație despre mașinile electrice este corectă?',
    hint: 'Privește întregul ciclu de viață: producție, electricitate și utilizare.',
    correct: 'lifecycle',
    explanation:
      'Fără emisii la eșapament nu înseamnă impact zero. Producția, bateria, sursa electricității și particulele de uzură contează.',
    options: [
      ['lifecycle', 'Impactul depinde de ciclul de viață', 'Producție, energie și utilizare.'],
      ['zero', 'Nu au niciun impact', 'În nicio etapă.'],
      ['same', 'Sunt identice în orice situație', 'Indiferent de energie sau utilizare.'],
    ],
  },
};
export class MissionEngine implements BuddyMissionEngine {
  start(id: MissionId, difficulty: Difficulty): PublicMission {
    if (id === 'city-balance')
      return {
        instanceId: randomUUID(),
        id,
        version: 1,
        difficulty,
        title: 'Un centru care respiră',
        question:
          difficulty === 'advanced'
            ? '30 de persoane, 36 de locuri virtuale. Un autobuz este disponibil pentru 12 persoane. Alege strategia care reduce numărul de mașini parcate, păstrând sosirea tuturor.'
            : '30 de șoferi, 36 de locuri virtuale. Testează cum se schimbă distribuția când iei în calcul ocuparea și mersul pe jos. Alege politica de echilibrare.',
        options: [
          {
            id: 'nearest',
            label: 'Cel mai scurt drum cu mașina',
            detail: 'Fiecare șofer minimizează doar condusul.',
          },
          {
            id: 'balanced',
            label: 'Distribuție echilibrată',
            detail: 'Condus + mers pe jos + penalizare de ocupare.',
          },
          ...(difficulty === 'beginner'
            ? []
            : [
                {
                  id: 'transit',
                  label: 'Park & ride virtual',
                  detail: '12 persoane cu autobuzul; ceilalți sunt distribuiți.',
                },
              ]),
        ],
        scenario: { drivers: 30, capacity: 36, seed: 7 },
      };
    const d = definitions[id];
    return {
      instanceId: randomUUID(),
      id,
      version: 1,
      difficulty,
      title: d.title,
      question: d.question,
      options: d.options
        .slice(0, difficulty === 'beginner' ? 2 : 3)
        .map(([id, label, detail]) => ({ id, label, detail })),
    };
  }
  evaluate(m: PublicMission, choice: string) {
    if (!m.options.some((o) => o.id === choice))
      throw Object.assign(new Error('Alege o opțiune din misiunea curentă.'), { status: 400 });
    if (m.id === 'city-balance') {
      const correct = choice === (m.difficulty === 'advanced' ? 'transit' : 'balanced');
      return {
        instanceId: m.instanceId,
        correct,
        explanation:
          m.difficulty === 'advanced'
            ? 'Park & ride mută 12 persoane într-un autobuz virtual. În acest model sunt mai puține mașini, fără a estima timpi de transport public reali.'
            : 'Politica echilibrată calculează condus + mers pe jos + 8 × gradul de ocupare. Este o regulă educațională explicită, nu o garanție că toate rezultatele sunt mai bune.',
        city: simulateBuddyCity(m.scenario!, choice as 'nearest' | 'balanced' | 'transit'),
      };
    }
    const d = definitions[m.id];
    return { instanceId: m.instanceId, correct: choice === d.correct, explanation: d.explanation };
  }
  hint(m: PublicMission) {
    return m.id === 'city-balance'
      ? m.difficulty === 'advanced'
        ? 'Caută opțiunea care schimbă numărul de persoane per vehicul.'
        : 'O regulă care include ocuparea poate distribui alegerile între parcări.'
      : definitions[m.id].hint;
  }
}
