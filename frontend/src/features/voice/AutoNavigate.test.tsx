import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AutoNavigate } from './AutoNavigate';

describe('navigation start after a voice choice (server rendering)', () => {
  it('names the parking and waits for the driver: no countdown, one start button', () => {
    const html = renderToStaticMarkup(
      <AutoNavigate parking="Strada Piatra Craiului" onGo={() => {}} onCancel={() => {}} />,
    );
    expect(html).toContain('Strada Piatra Craiului');
    expect(html).toContain('Pornește navigația');
    expect(html).toContain('aria-label="Închide"');
    expect(html).not.toMatch(/în \d+ s/);
  });
});
