export interface SecretMessage {
  id: string;
  code: string;
  ciphertext: string;
  iv: string;
  salt: string;
  created_at: string;
  expires_at: string;
  expired: boolean;
}

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export async function apiRequest(path: string, options?: RequestInit) {
  const response = await fetch(`/api${path}`, options);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(body.error || 'Request failed.', response.status);
  }
  return response.status === 204 ? null : response.json();
}
