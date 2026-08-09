import { authenticatedFetch, getApiUrl } from './api';

type Profile = {
  avatar_data_url?: string | null;
  display_name?: string | null;
  share_id?: string | null;
};

const inFlight = new Map<string, Promise<Profile | null>>();

/** Coalesce profile reads started by the page and its shared header. */
export function fetchProfile(authenticated: boolean, shareId?: string): Promise<Profile | null> {
  const key = authenticated ? 'authenticated' : `share:${shareId ?? ''}`;
  const existing = inFlight.get(key);
  if (existing) return existing;

  const request = (authenticated
    ? authenticatedFetch(getApiUrl('/auth/profile'))
    : fetch(getApiUrl(`/share/${shareId}/profile`)))
    .then((response) => response.ok ? response.json() : null)
    .finally(() => inFlight.delete(key));

  inFlight.set(key, request);
  return request;
}
