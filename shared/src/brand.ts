// All branding lives here. The product name VLAIQ FLOW is final (14 Nov 2026); change branding only in this file.
export const brand = {
  team: 'VLAIQ', // never change: team identity
  product: 'VLAIQ FLOW',
  tagline: 'Park smarter. Move greener.',
  motion: 'VLAIQ MOTION',
  currency: 'FLOW Coins',
  league: 'GREEN LEAGUE',
} as const;

/**
 * Who answers for personal data on the public site (GDPR controller) and how to reach them.
 * Fill in before going live on the production domain; the privacy page shows a visible gap while empty.
 */
export const privacyContact = {
  controller: null as string | null,
  email: null as string | null,
  domain: 'vlaiqflow.ro',
  updatedAt: '2026-11-14',
};
