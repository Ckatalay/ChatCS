export const API = "http://localhost:8000";

export type User = {
  id: number;
  email: string;
  full_name: string | null;
};

export type Conversation = {
  id: number;
  title: string;
  updated_at: string | null;
};

let refreshInFlight: Promise<boolean> | null = null;

function refreshSession(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = fetch(`${API}/auth/refresh`, {
      method: "POST",
      credentials: "include",
    })
      .then((response) => response.ok)
      .catch(() => false)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

/** Fetch with cookies, retrying once through /auth/refresh on a 401. */
export async function authFetch(
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const send = () => fetch(`${API}${path}`, { ...init, credentials: "include" });

  const response = await send();
  if (response.status !== 401) return response;

  return (await refreshSession()) ? send() : response;
}

export async function fetchConversations(): Promise<Conversation[]> {
  const response = await authFetch("/conversations");
  if (!response.ok) return [];

  const data = await response.json();
  return data.conversations;
}
