/**
 * The access token lives here and in React state only. Nothing in this codebase
 * writes it to localStorage or sessionStorage, so a XSS payload cannot read it
 * back out of persistent storage.
 */
let accessToken: string | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}
