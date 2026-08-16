import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  createApiKey,
  createOrg,
  createProject,
  listApiKeys,
  listOrgs,
  listProjects,
  login,
  LogEvent,
  Org,
  Project,
  register,
  revokeApiKey,
  searchLogs,
  SearchCursor,
} from "./api";

const TOKEN_KEY = "mmt_access_token";
const PAGE_SIZE = 20;

function defaultRange() {
  const to = new Date();
  const from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { from: from.toISOString(), to: to.toISOString() };
}

function slugify(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export function App() {
  const [token, setToken] = useState<string | null>(
    () => localStorage.getItem(TOKEN_KEY),
  );
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("test@becodemy.com");
  const [password, setPassword] = useState("password123");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [orgs, setOrgs] = useState<Org[]>([]);
  const [orgId, setOrgId] = useState("");
  const [newOrgName, setNewOrgName] = useState("");

  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectSlug, setNewProjectSlug] = useState("");

  const [searchQuery, setSearchQuery] = useState("");
  const [events, setEvents] = useState<LogEvent[]>([]);
  const [nextCursor, setNextCursor] = useState<SearchCursor | undefined>();
  const [newKeySecret, setNewKeySecret] = useState<string | null>(null);
  const [newKeyName, setNewKeyName] = useState("dashboard-key");
  const [keys, setKeys] = useState<
    Array<{ id: string; prefix: string; name: string; status: string }>
  >([]);

  const range = useMemo(() => defaultRange(), []);

  const refreshOrgs = useCallback(async (accessToken: string) => {
    const { orgs: list } = await listOrgs(accessToken);
    setOrgs(list);
    setOrgId((prev) => {
      if (prev && list.some((o) => o.id === prev)) return prev;
      return list[0]?.id ?? "";
    });
  }, []);

  const refreshProjects = useCallback(
    async (accessToken: string, selectedOrgId: string) => {
      if (!selectedOrgId) {
        setProjects([]);
        setProjectId("");
        return;
      }
      const { projects: list } = await listProjects(accessToken, selectedOrgId);
      setProjects(list);
      setProjectId((prev) => {
        if (prev && list.some((p) => p.id === prev)) return prev;
        return list[0]?.id ?? "";
      });
    },
    [],
  );

  const refreshKeys = useCallback(
    async (accessToken: string, selectedProjectId: string) => {
      if (!selectedProjectId) {
        setKeys([]);
        return;
      }
      const { keys: list } = await listApiKeys(accessToken, selectedProjectId);
      setKeys(list);
    },
    [],
  );

  useEffect(() => {
    if (!token) return;
    void refreshOrgs(token).catch((e) => setError((e as Error).message));
  }, [token, refreshOrgs]);

  useEffect(() => {
    if (!token || !orgId) return;
    void refreshProjects(token, orgId).catch((e) =>
      setError((e as Error).message),
    );
  }, [token, orgId, refreshProjects]);

  useEffect(() => {
    if (!token || !projectId) return;
    void refreshKeys(token, projectId).catch(() => setKeys([]));
  }, [token, projectId, newKeySecret, refreshKeys]);

  async function handleAuth(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      if (authMode === "register") {
        await register(email, password);
        setInfo("Account created — signing you in…");
      }
      const res = await login(email, password);
      localStorage.setItem(TOKEN_KEY, res.accessToken);
      setToken(res.accessToken);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setEvents([]);
    setNextCursor(undefined);
    setNewKeySecret(null);
    setOrgs([]);
    setProjects([]);
  }

  async function handleSearch(reset = true) {
    if (!token || !projectId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await searchLogs(token, projectId, range.from, range.to, {
        query: searchQuery,
        limit: PAGE_SIZE,
        cursor: reset ? undefined : nextCursor,
      });
      setEvents((prev) => (reset ? res.events : [...prev, ...res.events]));
      setNextCursor(res.nextCursor);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateOrg(e: FormEvent) {
    e.preventDefault();
    if (!token || !newOrgName.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const org = await createOrg(token, newOrgName.trim());
      setNewOrgName("");
      setInfo(`Org "${org.name}" created`);
      await refreshOrgs(token);
      setOrgId(org.id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateProject(e: FormEvent) {
    e.preventDefault();
    if (!token || !orgId || !newProjectName.trim()) return;
    const slug = newProjectSlug.trim() || slugify(newProjectName);
    setLoading(true);
    setError(null);
    try {
      const project = await createProject(
        token,
        orgId,
        newProjectName.trim(),
        slug,
      );
      setNewProjectName("");
      setNewProjectSlug("");
      setInfo(`Project "${project.name}" created`);
      await refreshProjects(token, orgId);
      setProjectId(project.id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateKey() {
    if (!token || !projectId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await createApiKey(
        token,
        projectId,
        newKeyName.trim() || "dashboard-key",
      );
      setNewKeySecret(res.secret);
      await refreshKeys(token, projectId);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRevokeKey(keyId: string) {
    if (!token || !projectId) return;
    if (!confirm("Revoke this API key? Ingest will stop immediately.")) return;
    setLoading(true);
    setError(null);
    try {
      await revokeApiKey(token, projectId, keyId);
      setInfo("API key revoked");
      await refreshKeys(token, projectId);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="page">
        <div className="card login-card">
          <h1>Meanutemonetring</h1>
          <p className="muted">
            {authMode === "login"
              ? "Sign in to search logs"
              : "Create your account"}
          </p>
          <div className="tabs">
            <button
              type="button"
              className={authMode === "login" ? "active" : ""}
              onClick={() => setAuthMode("login")}
            >
              Sign in
            </button>
            <button
              type="button"
              className={authMode === "register" ? "active" : ""}
              onClick={() => setAuthMode("register")}
            >
              Register
            </button>
          </div>
          <form onSubmit={handleAuth}>
            <label>
              Email
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                required
              />
            </label>
            <label>
              Password
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                minLength={8}
                required
              />
            </label>
            {error && <p className="error">{error}</p>}
            {info && <p className="info">{info}</p>}
            <button type="submit" disabled={loading}>
              {loading
                ? "Please wait…"
                : authMode === "login"
                  ? "Sign in"
                  : "Create account"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="topbar">
        <div>
          <h1>Logs</h1>
          <p className="muted">M4 dashboard · admin + query APIs</p>
        </div>
        <button className="ghost" onClick={handleLogout}>
          Logout
        </button>
      </header>

      {error && <p className="banner error">{error}</p>}
      {info && <p className="banner info">{info}</p>}

      <div className="grid">
        <section className="card stack">
          <h2>Organization</h2>
          <label>
            Org
            <select
              value={orgId}
              onChange={(e) => setOrgId(e.target.value)}
            >
              {orgs.length === 0 && <option value="">No orgs yet</option>}
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name} ({o.role})
                </option>
              ))}
            </select>
          </label>
          <form className="inline-form" onSubmit={handleCreateOrg}>
            <input
              value={newOrgName}
              onChange={(e) => setNewOrgName(e.target.value)}
              placeholder="New org name"
              minLength={2}
              required
            />
            <button type="submit" disabled={loading}>
              Create org
            </button>
          </form>

          <h2>Project</h2>
          <label>
            Project
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              disabled={!orgId}
            >
              {projects.length === 0 && <option value="">No projects</option>}
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.slug})
                </option>
              ))}
            </select>
          </label>
          <form className="inline-form" onSubmit={handleCreateProject}>
            <input
              value={newProjectName}
              onChange={(e) => {
                setNewProjectName(e.target.value);
                if (!newProjectSlug) setNewProjectSlug(slugify(e.target.value));
              }}
              placeholder="Project name"
              minLength={2}
              required
            />
            <input
              value={newProjectSlug}
              onChange={(e) => setNewProjectSlug(e.target.value)}
              placeholder="slug"
              pattern="^[a-z0-9]+(?:-[a-z0-9]+)*$"
            />
            <button type="submit" disabled={loading || !orgId}>
              Create project
            </button>
          </form>

          <h2>API keys</h2>
          <label>
            Key name
            <input
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
            />
          </label>
          <button
            onClick={handleCreateKey}
            disabled={loading || !projectId}
          >
            Create API key
          </button>

          {newKeySecret && (
            <div className="secret-box">
              <strong>Copy now — shown once:</strong>
              <code>{newKeySecret}</code>
            </div>
          )}

          {keys.length > 0 && (
            <ul className="key-list">
              {keys.map((k) => (
                <li key={k.id}>
                  <div>
                    <span>{k.prefix}</span>
                    <span className="muted"> · {k.name}</span>
                  </div>
                  <div className="key-actions">
                    <span className={`status ${k.status}`}>{k.status}</span>
                    {k.status === "active" && (
                      <button
                        className="ghost small"
                        onClick={() => void handleRevokeKey(k.id)}
                        disabled={loading}
                      >
                        Revoke
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card table-card">
          <div className="table-header">
            <h2>Search results ({events.length})</h2>
            <div className="row">
              <button
                onClick={() => void handleSearch(true)}
                disabled={loading || !projectId}
              >
                Search
              </button>
              {nextCursor && (
                <button
                  className="ghost"
                  onClick={() => void handleSearch(false)}
                  disabled={loading || !projectId}
                >
                  Next page
                </button>
              )}
            </div>
          </div>
          <label>
            Message filter
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="e.g. hello"
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleSearch(true);
              }}
            />
          </label>
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Level</th>
                <th>Message</th>
                <th>Service</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={`${e.eventId}-${e.receivedAt}`}>
                  <td>{new Date(e.receivedAt).toLocaleString()}</td>
                  <td>
                    <span className={`pill ${e.level}`}>{e.level}</span>
                  </td>
                  <td>{e.message}</td>
                  <td>{e.service || "—"}</td>
                </tr>
              ))}
              {events.length === 0 && (
                <tr>
                  <td colSpan={4} className="muted">
                    No events in the last 30 days. Create a key, ingest logs,
                    then search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
