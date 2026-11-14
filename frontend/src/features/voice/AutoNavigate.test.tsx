import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AutoNavigate } from './AutoNavigate';

describe('hands-free navigation start (server rendering)', () => {
  it('names the parking, shows the countdown and offers a large cancel', () => {
    const html = renderToStaticMarkup(
      <AutoNavigate parking="Strada Piatra Craiului" onGo={() => {}} onCancel={() => {}} />,
    );
    expect(html).toContain('Strada Piatra Craiului');
    expect(html).toContain('în 8 s');
    expect(html).toContain('Pornește acum');
    expect(html).toContain('aria-label="Anulează pornirea navigației"');
    expect(html).toContain('role="status"');
  });
});
