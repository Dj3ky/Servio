import { useAuthStore } from '@/stores/authStore';

const BASE_URL = '/api';

class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    public details?: Record<string, string[]>,
  ) {
    super(code);
    this.name = 'ApiError';
  }
}

export { ApiError };

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const token = useAuthStore.getState().token;

  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let fetchBody: BodyInit | undefined;
  if (body instanceof FormData) {
    fetchBody = body;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    fetchBody = JSON.stringify(body);
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: fetchBody,
    signal,
  });

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  let data: any;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    // non-JSON body (e.g. proxy error, server crash before route handler)
    if (!res.ok) throw new ApiError(res.status, 'errors.unknown');
    return undefined as T;
  }

  if (!res.ok) {
    if (res.status === 401) {
      useAuthStore.getState().clearAuth();
      window.location.href = '/login';
    }
    throw new ApiError(res.status, data?.error ?? 'errors.unknown', data?.details);
  }

  return data as T;
}

async function downloadBlob(path: string, filename: string): Promise<void> {
  // Get a one-time token so the download can be triggered via window.open().
  // A real browser navigation works in PWA standalone mode; programmatic a.click() on a blob URL does not.
  const encoded = encodeURIComponent(filename);
  const { token: dlToken } = await request<{ token: string }>('POST', path.replace('/download/', '/download-token/'));
  window.open(`${BASE_URL}${path.replace(`/download/${encoded}`, `/file/${encoded}`)}?token=${dlToken}`, '_blank');
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>('GET', path, undefined, signal),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
  downloadBlob,
};
