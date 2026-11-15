import { describe, expect, it } from 'vitest';
import { readIntent } from './intents';

describe('driver intents from their own words', () => {
  it('reads one travel mode', () => {
    expect(readIntent('Vreau doar cu mașina la Iulius Mall').mode).toBe('driving');
    expect(readIntent('mergem cu bicicleta').mode).toBe('cycling');
    expect(readIntent('prefer pe jos').mode).toBe('walking');
    expect(readIntent('la Iulius Mall').mode).toBeNull();
  });
  it('treats two modes in one sentence as a question, not a choice', () => {
    expect(readIntent('cu mașina sau cu bicicleta?').mode).toBeNull();
  });
  it('reads permission to start', () => {
    expect(readIntent('Hai să mergem!').go).toBe(true);
    expect(readIntent('ok, pornește navigația').go).toBe(true);
    expect(readIntent('plecăm la aeroport').go).toBe(true);
    expect(readIntent('cât costă parcarea?').go).toBe(false);
  });
  it('never starts on a negation', () => {
    expect(readIntent('nu, nu pornim încă').go).toBe(false);
    expect(readIntent('stai, mergem mai târziu').go).toBe(false);
  });
});
