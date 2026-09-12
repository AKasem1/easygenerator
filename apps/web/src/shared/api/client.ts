import axios from 'axios';

/**
 * Shared axios instance.
 *
 * `withCredentials` is on because the API issues its session cookie with
 * `credentials: true` and an explicit CORS origin. No interceptors yet — auth
 * refresh and error normalisation land here once those exist.
 */
export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});
