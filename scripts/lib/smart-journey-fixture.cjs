// Deliberately synthetic provider responses for UI tests. Never imported by the application.
exports.completeFixture = function completeFixture(input) {
  const origin = input.origin,
    destination = input.destination,
    parking = [destination[0] - 0.003, destination[1] - 0.001];
  const time = '2026-11-14T10:00:00.000Z';
  const metric = (value, unit) => ({
    value,
    unit,
    quality: value === null ? 'unknown' : 'estimated',
    source: 'SYNTHETIC TEST FIXTURE',
  });
  const leg = (type, from, to, duration, distance) => ({
    id: `leg-${type}`,
    type,
    from,
    to,
    profile: { drive: 'driving-car', walk: 'foot-walking', cycle: 'cycling-regular' }[type],
    duration: metric(duration, 's'),
    distance: metric(distance, 'm'),
    warnings: [],
    route: {
      id: `fixture-${type}`,
      duration,
      distance,
      geometry: [from, [from[0], to[1]], to],
      quality: 'estimated',
      source: 'SYNTHETIC TEST FIXTURE',
      steps: [
        { index: 0, type: 'depart', road: '' },
        { index: 2, type: 'arrive', road: '' },
      ],
    },
  });
  const build = (category, legs, parkingInfo = null) => {
    const moves = legs.filter((l) => l.type !== 'parking');
    const seconds = moves.reduce((n, l) => n + l.route.duration, 0),
      meters = moves.reduce((n, l) => n + l.route.distance, 0);
    return {
      id: `fixture-${category}`,
      origin,
      destination,
      category,
      legs,
      parking: parkingInfo,
      travelSeconds: metric(seconds, 's'),
      distance: metric(meters, 'm'),
      elapsedSeconds: metric(parkingInfo ? null : seconds, 's'),
      practical: true,
      calculatedAt: time,
      limitations: ['SYNTHETIC TEST FIXTURE; not a real provider route.'],
    };
  };
  const journeys = [
    build(
      'car_park_walk',
      [
        leg('drive', origin, parking, 300, 1500),
        {
          id: 'leg-parking',
          type: 'parking',
          from: parking,
          to: parking,
          duration: metric(null, 's'),
          warnings: [],
        },
        leg('walk', parking, destination, 180, 250),
      ],
      {
        id: 'test-parking',
        name: 'TEST · Parcare sintetică',
        coordinate: parking,
        access: 'unknown',
        availability: { value: null, quality: 'unknown', source: 'NO LIVE DATA' },
        fee: {
          minorUnits: null,
          currency: null,
          quality: 'unknown',
          source: 'FIXTURE',
          note: 'Preț necunoscut.',
        },
        stayMinutes: 120,
        tariffAt: time,
        source: 'SYNTHETIC FIXTURE',
        warnings: ['Accesul nu este confirmat.'],
      },
    ),
    build('cycle', [leg('cycle', origin, destination, 600, 1800)]),
    build('walk', [leg('walk', origin, destination, 1500, 1700)]),
  ];
  const rankings = {};
  for (const p of ['fastest', 'balanced', 'green']) {
    const first = p === 'fastest' ? journeys[0] : journeys[1];
    rankings[p] = {
      recommendedId: first.id,
      ids: [first.id, ...journeys.filter((j) => j !== first).map((j) => j.id)],
      explanation: 'SYNTHETIC TEST POLICY · timp pe trasee; fără timpul de căutare a parcării.',
    };
  }
  return {
    journeys,
    rankings,
    unavailable: [],
    opportunity: {
      journeyId: journeys[1].id,
      extraSeconds: 120,
      explanation: 'Fixture comparison excludes unknown parking search.',
    },
    calculatedAt: time,
    coverage: 'SYNTHETIC TEST FIXTURE. No external provider validation.',
    limitations: ['SYNTHETIC TEST FIXTURE'],
  };
};
