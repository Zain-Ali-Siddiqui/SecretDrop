export interface SecretMessage {
  id: string;
  code: string;
  ciphertext: string;
  iv: string;
  salt: string;
  created_at: string;
  expires_at: string;
  expired: boolean;
  burn_after_read: boolean;
  view_count: number;
}

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export async function apiRequest(path: string, options?: RequestInit) {
  const apiBase = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/+$/, '');
  const response = await fetch(`${apiBase}${path}`, options);
  if (!response.headers.get('content-type')?.includes('application/json') && response.status !== 204) {
    throw new ApiError('The message service is unavailable. Please try again later.', response.status);
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(body.error || 'Request failed.', response.status);
  }
  return response.status === 204 ? null : response.json();
}
