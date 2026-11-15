import { expect, it } from 'vitest';
import { contributorSource, ownerKey } from './identity';
it('isolates identity keys by both issuer and subject, with no email linking', () => {
  expect(ownerKey({ issuer: 'https://a/', subject: 'user' })).not.toBe(
    ownerKey({ issuer: 'https://b/', subject: 'user' }),
  );
  expect(ownerKey({ issuer: 'https://a/', subject: 'auth0|a' })).not.toBe(
    ownerKey({ issuer: 'https://a/', subject: 'google|a' }),
  );
});
it('labels explicit backend-only grants separately and fails closed for emails and frontend roles', () => {
  const grants = [{ issuer: 'https://trusted/', subject: 'auth0|contributor' }];
  expect(contributorSource({ iss: 'https://trusted/', sub: 'auth0|contributor' }, grants)).toBe(
    'application-managed',
  );
  expect(contributorSource({ iss: 'https://other/', sub: 'auth0|contributor' }, grants)).toBeNull();
  expect(
    contributorSource(
      {
        iss: 'https://trusted/',
        sub: 'auth0|ordinary',
        email: 'contributor@example.com',
        role: 'VLAIQ Team Contributor',
      },
      grants,
    ),
  ).toBeNull();
  expect(contributorSource({ permissions: ['update:team-presentation'] }, [])).toBe(
    'auth0-permissions',
  );
  expect(contributorSource({}, [])).toBeNull();
});
