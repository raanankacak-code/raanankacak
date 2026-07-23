export class ApiClientError extends Error {}

export async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = body?.error || `Request failed (${res.status})`;
    // Server 500s carry a correlation id; surfacing it lets users quote it in
    // a bug report so the exact server-side stack trace can be found.
    throw new ApiClientError(body?.errorId ? `${message} (ref: ${body.errorId})` : message);
  }
  return body as T;
}
