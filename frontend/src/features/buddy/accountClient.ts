import { API_BASE, privateFetch } from '../identity/privateApi';
import { createBuddyClientFromTransport } from './client';
/** Uses the host's token generation, 401 expiry, account isolation and SDK memory cache. */
export const accountBuddy = createBuddyClientFromTransport(privateFetch, API_BASE);
