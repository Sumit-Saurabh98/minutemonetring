const ADMIN_URL = import.meta.env.VITE_ADMIN_URL ?? "http://localhost:3002";
const QUERY_URL = import.meta.env.VITE_QUERY_URL ?? "http://localhost:3003";

export type Org = { id: string; name: string; role: string };
export type Project = {
  id: string;
  name: string;
  slug: string;
  created_at: string;
};
export type ApiKey = {
  id: string;
  prefix: string;
  name: string;
  status: string;
};
export type LogEvent = {
  eventId: string;
  level: string;
  message: string;
  receivedAt: string;
  service: string;
  host: string;
  env: string;
};
export type SearchCursor = { receivedAt: string; eventId: string };

async function request<T>(
  base: string,
  path: string,
  token: string | null,
  init?: RequestInit,
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${base}${path}`, { ...init, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = (body as { error?: string }).error ?? res.statusText;
    throw new Error(err);
  }
  return body as T;
}

export async function register(email: string, password: string) {
  return request<{ id: string }>(ADMIN_URL, "/v1/auth/register", null, {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function login(email: string, password: string) {
  return request<{ accessToken: string; user: { id: string; email: string } }>(
    ADMIN_URL,
    "/v1/auth/login",
    null,
    { method: "POST", body: JSON.stringify({ email, password }) },
  );
}

export async function listOrgs(token: string) {
  return request<{ orgs: Org[] }>(ADMIN_URL, "/v1/orgs", token);
}

export async function createOrg(token: string, name: string) {
  return request<{ id: string; name: string }>(ADMIN_URL, "/v1/orgs", token, {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export async function listProjects(token: string, orgId: string) {
  return request<{ projects: Project[] }>(
    ADMIN_URL,
    `/v1/orgs/${orgId}/projects`,
    token,
  );
}

export async function createProject(
  token: string,
  orgId: string,
  name: string,
  slug: string,
) {
  return request<{ id: string; name: string; slug: string }>(
    ADMIN_URL,
    `/v1/orgs/${orgId}/projects`,
    token,
    { method: "POST", body: JSON.stringify({ name, slug }) },
  );
}

export async function createApiKey(
  token: string,
  projectId: string,
  name: string,
) {
  return request<{ id: string; prefix: string; secret: string; name: string }>(
    ADMIN_URL,
    `/v1/projects/${projectId}/api-keys`,
    token,
    { method: "POST", body: JSON.stringify({ name }) },
  );
}

export async function listApiKeys(token: string, projectId: string) {
  return request<{ keys: ApiKey[] }>(
    ADMIN_URL,
    `/v1/projects/${projectId}/api-keys`,
    token,
  );
}

export async function revokeApiKey(
  token: string,
  projectId: string,
  keyId: string,
) {
  return request<{ revoked: true }>(
    ADMIN_URL,
    `/v1/projects/${projectId}/api-keys/${keyId}/revoke`,
    token,
    { method: "POST" },
  );
}

export async function searchLogs(
  token: string,
  projectId: string,
  from: string,
  to: string,
  options?: {
    query?: string;
    limit?: number;
    cursor?: SearchCursor;
  },
) {
  return request<{
    events: LogEvent[];
    nextCursor?: SearchCursor;
  }>(QUERY_URL, `/v1/projects/${projectId}/logs/search`, token, {
    method: "POST",
    body: JSON.stringify({
      from,
      to,
      query: options?.query || undefined,
      limit: options?.limit ?? 20,
      cursor: options?.cursor,
    }),
  });
}
