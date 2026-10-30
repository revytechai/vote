/**
 * Base URL of the voting REST API.
 *
 * Kept in its own module so the HTTP client, the CSRF interceptor and any
 * future server-side rendering config all agree on a single value.
 */
export const API_BASE = '/api/v1';
