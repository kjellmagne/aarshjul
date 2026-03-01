"use client";

import Link from "next/link";
import { DateTime } from "luxon";
import { signOut, useSession } from "next-auth/react";
import { useEffect, useMemo, useState } from "react";

type SysAdminOverviewModel = {
  users: number;
  systemAdmins: number;
  tenantAdmins: number;
  tenants: number;
  tenantAdminAssignments: number;
  wheels: number;
  activities: number;
  shares: number;
  groups: number;
  accounts: number;
};

type TenantModel = {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
  counts: {
    admins: number;
    members: number;
    wheels: number;
  };
};

type TenantAdminAssignmentModel = {
  tenantId: string;
  userId: string;
  role: "ADMIN";
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    email: string | null;
    name: string | null;
    isSystemAdmin: boolean;
    isAdmin: boolean;
    lastLoginAt: string | null;
    hasLocalPassword: boolean;
    hasAzureIdentity: boolean;
    providers: string[];
  };
};

function formatDateTime(value: string) {
  const date = DateTime.fromISO(value, { zone: "Europe/Oslo" });
  if (!date.isValid) {
    return value;
  }
  return date.toFormat("yyyy-LL-dd HH:mm");
}

async function requestJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      ...(init?.body ? { "Content-Type": "application/json" } : {})
    }
  });

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message =
      typeof payload === "object" &&
      payload !== null &&
      "error" in payload &&
      typeof (payload as { error?: unknown }).error === "string"
        ? (payload as { error: string }).error
        : `HTTP ${response.status}`;
    throw new Error(message);
  }

  return payload as T;
}

export default function SysAdminPage() {
  const { data: session, status } = useSession();
  const [overview, setOverview] = useState<SysAdminOverviewModel | null>(null);
  const [tenants, setTenants] = useState<TenantModel[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState("");
  const [tenantAdmins, setTenantAdmins] = useState<TenantAdminAssignmentModel[]>([]);
  const [tenantNameDraft, setTenantNameDraft] = useState("");
  const [tenantSlugDraft, setTenantSlugDraft] = useState("");
  const [tenantEditName, setTenantEditName] = useState("");
  const [tenantEditSlug, setTenantEditSlug] = useState("");
  const [query, setQuery] = useState("");
  const [newAdminName, setNewAdminName] = useState("");
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [newAdminPassword, setNewAdminPassword] = useState("");
  const [editingAdminUserId, setEditingAdminUserId] = useState("");
  const [editAdminName, setEditAdminName] = useState("");
  const [editAdminEmail, setEditAdminEmail] = useState("");
  const [editAdminPassword, setEditAdminPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const isSystemAdmin = Boolean(session?.user?.isSystemAdmin);
  const canLoad = status === "authenticated" && isSystemAdmin;

  useEffect(() => {
    if (!notice) {
      return;
    }
    const timer = window.setTimeout(() => setNotice(""), 2200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  async function loadAll() {
    if (!canLoad) {
      return;
    }

    try {
      setIsLoading(true);
      setError("");
      const [overviewPayload, tenantsPayload] = await Promise.all([
        requestJson<{ overview: SysAdminOverviewModel }>("/api/sysadmin/overview"),
        requestJson<{ tenants: TenantModel[] }>("/api/sysadmin/tenants")
      ]);
      setOverview(overviewPayload.overview);
      setTenants(tenantsPayload.tenants ?? []);
      if ((tenantsPayload.tenants?.length ?? 0) > 0) {
        setSelectedTenantId((prev) =>
          prev && tenantsPayload.tenants.some((tenant) => tenant.id === prev) ? prev : tenantsPayload.tenants[0]!.id
        );
      } else {
        setSelectedTenantId("");
        setTenantAdmins([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load system admin data.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadAll();
  }, [canLoad]);

  async function loadTenantAdmins(tenantId: string) {
    if (!tenantId || !canLoad) {
      setTenantAdmins([]);
      return;
    }

    try {
      const payload = await requestJson<{ admins: TenantAdminAssignmentModel[] }>(`/api/sysadmin/tenants/${tenantId}/admins`);
      setTenantAdmins(payload.admins ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load tenant admins.");
      setTenantAdmins([]);
    }
  }

  useEffect(() => {
    void loadTenantAdmins(selectedTenantId);
  }, [selectedTenantId, canLoad]);

  async function claimSystemAdminAccess() {
    if (status !== "authenticated") {
      return;
    }

    try {
      setIsClaiming(true);
      setError("");
      setNotice("");
      await requestJson("/api/sysadmin/claim", { method: "POST" });
      setNotice("System admin access granted. Reloading...");
      window.setTimeout(() => {
        window.location.reload();
      }, 300);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not claim system admin access.");
    } finally {
      setIsClaiming(false);
    }
  }

  async function createTenant() {
    if (!canLoad) {
      return;
    }
    const name = tenantNameDraft.trim();
    const slug = tenantSlugDraft.trim();
    if (!name) {
      setError("Tenant name is required.");
      return;
    }

    try {
      setIsUpdating(true);
      setError("");
      setNotice("");
      const payload = await requestJson<{ tenant: TenantModel }>("/api/sysadmin/tenants", {
        method: "POST",
        body: JSON.stringify({
          name,
          ...(slug ? { slug } : {})
        })
      });
      setTenantNameDraft("");
      setTenantSlugDraft("");
      await loadAll();
      if (payload.tenant?.id) {
        setSelectedTenantId(payload.tenant.id);
      }
      setNotice("Tenant created.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create tenant.");
    } finally {
      setIsUpdating(false);
    }
  }

  async function deleteTenant(tenant: TenantModel) {
    if (!canLoad) {
      return;
    }
    if (tenant.slug === "default") {
      setError("Default tenant cannot be deleted.");
      return;
    }

    const confirmed = window.confirm(`Delete tenant "${tenant.name}"? This cannot be undone.`);
    if (!confirmed) {
      return;
    }

    try {
      setIsUpdating(true);
      setError("");
      await requestJson(`/api/sysadmin/tenants/${tenant.id}`, {
        method: "DELETE"
      });
      await loadAll();
      setNotice("Tenant deleted.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete tenant.");
    } finally {
      setIsUpdating(false);
    }
  }

  async function updateTenantSettings() {
    if (!canLoad || !selectedTenantId) {
      return;
    }
    const name = tenantEditName.trim();
    const slug = tenantEditSlug.trim();
    if (!name) {
      setError("Tenant name is required.");
      return;
    }
    if (!slug) {
      setError("Tenant slug is required.");
      return;
    }

    try {
      setIsUpdating(true);
      setError("");
      setNotice("");
      await requestJson(`/api/sysadmin/tenants/${selectedTenantId}`, {
        method: "PATCH",
        body: JSON.stringify({
          name,
          slug
        })
      });
      await loadAll();
      setNotice("Tenant settings updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update tenant settings.");
    } finally {
      setIsUpdating(false);
    }
  }

  async function createLocalTenantAdmin() {
    if (!canLoad || !selectedTenantId) {
      return;
    }
    const email = newAdminEmail.trim().toLowerCase();
    const password = newAdminPassword;
    const name = newAdminName.trim();
    if (!email || !email.includes("@")) {
      setError("Valid e-mail is required.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    try {
      setIsUpdating(true);
      setError("");
      await requestJson(`/api/sysadmin/tenants/${selectedTenantId}/admins`, {
        method: "POST",
        body: JSON.stringify({
          mode: "createLocal",
          email,
          password,
          ...(name ? { name } : {})
        })
      });
      setNewAdminName("");
      setNewAdminEmail("");
      setNewAdminPassword("");
      await Promise.all([loadAll(), loadTenantAdmins(selectedTenantId)]);
      setNotice("Local tenant admin account created.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create local tenant admin.");
    } finally {
      setIsUpdating(false);
    }
  }

  function startEditTenantAdmin(assignment: TenantAdminAssignmentModel) {
    setEditingAdminUserId(assignment.userId);
    setEditAdminName(assignment.user.name ?? "");
    setEditAdminEmail(assignment.user.email ?? "");
    setEditAdminPassword("");
    setError("");
  }

  function cancelEditTenantAdmin() {
    setEditingAdminUserId("");
    setEditAdminName("");
    setEditAdminEmail("");
    setEditAdminPassword("");
  }

  async function saveTenantAdminEdits(userId: string) {
    if (!canLoad || !selectedTenantId || !userId) {
      return;
    }
    const email = editAdminEmail.trim().toLowerCase();
    const name = editAdminName.trim();
    const password = editAdminPassword;
    if (!email || !email.includes("@")) {
      setError("Valid e-mail is required.");
      return;
    }
    if (password && password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    try {
      setIsUpdating(true);
      setError("");
      await requestJson(`/api/sysadmin/tenants/${selectedTenantId}/admins/${userId}`, {
        method: "PATCH",
        body: JSON.stringify({
          name,
          email,
          ...(password ? { password } : {})
        })
      });
      cancelEditTenantAdmin();
      await Promise.all([loadAll(), loadTenantAdmins(selectedTenantId)]);
      setNotice("Tenant admin account updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update tenant admin.");
    } finally {
      setIsUpdating(false);
    }
  }

  async function deleteTenantAdminAccount(assignment: TenantAdminAssignmentModel) {
    if (!canLoad || !selectedTenantId) {
      return;
    }
    const displayName = assignment.user.name || assignment.user.email || assignment.userId;
    const confirmed = window.confirm(`Delete tenant admin account "${displayName}"? This cannot be undone.`);
    if (!confirmed) {
      return;
    }

    try {
      setIsUpdating(true);
      setError("");
      await requestJson(`/api/sysadmin/tenants/${selectedTenantId}/admins/${assignment.userId}?mode=account`, {
        method: "DELETE"
      });
      if (editingAdminUserId === assignment.userId) {
        cancelEditTenantAdmin();
      }
      await Promise.all([loadAll(), loadTenantAdmins(selectedTenantId)]);
      setNotice("Tenant admin account deleted.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete tenant admin account.");
    } finally {
      setIsUpdating(false);
    }
  }

  const normalizedTenantUserQuery = useMemo(() => query.trim().toLowerCase(), [query]);
  const selectedTenant = useMemo(
    () => tenants.find((tenant) => tenant.id === selectedTenantId) ?? null,
    [selectedTenantId, tenants]
  );
  const filteredTenantAdmins = useMemo(() => {
    return tenantAdmins.filter((assignment) => {
      if (!normalizedTenantUserQuery) {
        return true;
      }
      const haystack = `${assignment.user.name ?? ""} ${assignment.user.email ?? ""} ${assignment.user.providers.join(" ")}`.toLowerCase();
      return haystack.includes(normalizedTenantUserQuery);
    });
  }, [tenantAdmins, normalizedTenantUserQuery]);

  useEffect(() => {
    const tenant = tenants.find((entry) => entry.id === selectedTenantId);
    if (!tenant) {
      setTenantEditName("");
      setTenantEditSlug("");
      return;
    }
    setTenantEditName(tenant.name);
    setTenantEditSlug(tenant.slug);
  }, [tenants, selectedTenantId]);

  if (status === "loading") {
    return (
      <main className="admin-page">
        <section className="admin-shell-panel">
          <p>Loading system admin page...</p>
        </section>
      </main>
    );
  }

  if (status !== "authenticated") {
    return (
      <main className="admin-page">
        <section className="admin-shell-panel">
          <h1>System administration</h1>
          <p>You must sign in to access this page.</p>
          <Link href="/" className="admin-link-button">
            Go to login
          </Link>
        </section>
      </main>
    );
  }

  if (!isSystemAdmin) {
    return (
      <main className="admin-page">
        <section className="admin-shell-panel">
          <h1>System administration</h1>
          <p>Your account does not have system admin access.</p>
          <p className="admin-meta">
            First-time setup can claim system admin once. After bootstrap, existing system admins manage access.
          </p>
          <div className="admin-header-actions">
            <button type="button" onClick={() => void claimSystemAdminAccess()} disabled={isClaiming}>
              {isClaiming ? "Claiming..." : "Claim system admin access"}
            </button>
            <Link href="/" className="admin-link-button">
              Back to app
            </Link>
          </div>
          {error ? <p className="admin-state is-error">{error}</p> : null}
          {notice ? <p className="admin-state">{notice}</p> : null}
        </section>
      </main>
    );
  }

  return (
    <main className="admin-page">
      <header className="admin-page-header">
        <div>
          <h1>System administration</h1>
          <p>
            Signed in as {session.user.email ?? "-"} ({session.user.name ?? "System admin"})
          </p>
        </div>
        <div className="admin-header-actions">
          <button type="button" onClick={() => void loadAll()} disabled={isLoading || isUpdating}>
            Refresh
          </button>
          <Link href="/" className="admin-link-button">
            Back to app
          </Link>
          <button type="button" className="secondary" onClick={() => signOut({ callbackUrl: "/" })}>
            Sign out
          </button>
        </div>
      </header>

      {error ? <p className="admin-state is-error">{error}</p> : null}
      {notice ? <p className="admin-state">{notice}</p> : null}

      <section className="admin-shell-panel">
        <header className="admin-section-header">
          <h2>Platform overview</h2>
          <p>System-wide usage and role counts.</p>
        </header>
        {overview ? (
          <div className="admin-overview-grid">
            <article className="admin-overview-item">
              <h4>Users</h4>
              <p>{overview.users}</p>
            </article>
            <article className="admin-overview-item">
              <h4>System admins</h4>
              <p>{overview.systemAdmins}</p>
            </article>
            <article className="admin-overview-item">
              <h4>Tenant admins</h4>
              <p>{overview.tenantAdmins}</p>
            </article>
            <article className="admin-overview-item">
              <h4>Tenants</h4>
              <p>{overview.tenants}</p>
            </article>
            <article className="admin-overview-item">
              <h4>Tenant admin assignments</h4>
              <p>{overview.tenantAdminAssignments}</p>
            </article>
            <article className="admin-overview-item">
              <h4>Wheels</h4>
              <p>{overview.wheels}</p>
            </article>
            <article className="admin-overview-item">
              <h4>Activities</h4>
              <p>{overview.activities}</p>
            </article>
            <article className="admin-overview-item">
              <h4>Shares</h4>
              <p>{overview.shares}</p>
            </article>
            <article className="admin-overview-item">
              <h4>AAD groups</h4>
              <p>{overview.groups}</p>
            </article>
            <article className="admin-overview-item">
              <h4>Sign-ins</h4>
              <p>{overview.accounts}</p>
            </article>
          </div>
        ) : (
          <p className="admin-meta">No overview data loaded yet.</p>
        )}
      </section>

      <section className="admin-shell-panel">
        <header className="admin-section-header">
          <h2>Tenant administration</h2>
          <p>Add, edit and delete tenants. Manage local tenant admin accounts per tenant.</p>
        </header>

        <div className="admin-form-grid">
          <label>
            Tenant name
            <input
              value={tenantNameDraft}
              onChange={(event) => setTenantNameDraft(event.target.value)}
              placeholder="Example: North region"
            />
          </label>
          <label>
            Tenant slug (optional)
            <input
              value={tenantSlugDraft}
              onChange={(event) => setTenantSlugDraft(event.target.value)}
              placeholder="north-region"
            />
          </label>
        </div>

        <div className="admin-section-actions">
          <button type="button" onClick={() => void createTenant()} disabled={isUpdating || isLoading || !tenantNameDraft.trim()}>
            Add tenant
          </button>
        </div>

        <div className="admin-tenant-layout">
          <div className="admin-users-list admin-tenant-list">
            {tenants.length > 0 ? (
              tenants.map((tenant) => {
                const isSelected = tenant.id === selectedTenantId;
                return (
                  <article
                    key={tenant.id}
                    className={`admin-user-row ${isSelected ? "is-selected" : ""}`}
                    role="button"
                    tabIndex={0}
                    aria-pressed={isSelected}
                    onClick={() => {
                      setSelectedTenantId(tenant.id);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelectedTenantId(tenant.id);
                      }
                    }}
                  >
                    <header>
                      <h4>{tenant.name}</h4>
                      <p>slug: {tenant.slug}</p>
                    </header>
                    <p>
                      Admins: {tenant.counts.admins} | Members: {tenant.counts.members} | Wheels: {tenant.counts.wheels}
                    </p>
                    <div className="admin-user-actions admin-tenant-actions">
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => {
                          setSelectedTenantId(tenant.id);
                        }}
                        disabled={isUpdating}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => void deleteTenant(tenant)}
                        disabled={isUpdating || tenant.slug === "default"}
                      >
                        Delete
                      </button>
                    </div>
                  </article>
                );
              })
            ) : (
              <p className="admin-empty">No tenants found yet.</p>
            )}
          </div>

          {selectedTenant ? (
            <div className="admin-shell-panel admin-tenant-detail">
              <header className="admin-section-header">
                <h2>{selectedTenant.name}</h2>
                <p>
                  Tenant details and access management. slug: <strong>{selectedTenant.slug}</strong>
                </p>
              </header>

              <div className="admin-tenant-settings">
                <div className="admin-form-grid">
                  <label>
                    Tenant name
                    <input
                      value={tenantEditName}
                      onChange={(event) => setTenantEditName(event.target.value)}
                      placeholder="Tenant name"
                    />
                  </label>
                  <label>
                    Tenant slug
                    <input
                      value={tenantEditSlug}
                      onChange={(event) => setTenantEditSlug(event.target.value)}
                      placeholder="tenant-slug"
                      disabled={selectedTenant.slug === "default"}
                    />
                  </label>
                </div>
                <p className="admin-meta">
                  Created: {formatDateTime(selectedTenant.createdAt)} | Updated: {formatDateTime(selectedTenant.updatedAt)}
                </p>
                {selectedTenant.slug === "default" ? (
                  <p className="admin-meta">Default tenant slug cannot be changed, but name can be edited.</p>
                ) : null}
                <div className="admin-section-actions">
                  <button type="button" onClick={() => void updateTenantSettings()} disabled={isUpdating || !selectedTenantId}>
                    Update tenant
                  </button>
                </div>
              </div>

              <header className="admin-section-header">
                <h2>Tenant admin accounts (local)</h2>
                <p>Create, edit and delete local tenant admin accounts for this tenant.</p>
              </header>

              <div className="admin-form-grid">
                <label>
                  Name (optional)
                  <input value={newAdminName} onChange={(event) => setNewAdminName(event.target.value)} placeholder="Admin name" />
                </label>
                <label>
                  E-mail
                  <input
                    value={newAdminEmail}
                    onChange={(event) => setNewAdminEmail(event.target.value)}
                    placeholder="admin@example.com"
                    autoComplete="email"
                  />
                </label>
                <label>
                  Password
                  <input
                    type="password"
                    value={newAdminPassword}
                    onChange={(event) => setNewAdminPassword(event.target.value)}
                    placeholder="Minimum 8 characters"
                    autoComplete="new-password"
                  />
                </label>
              </div>
              <div className="admin-section-actions">
                <button
                  type="button"
                  onClick={() => void createLocalTenantAdmin()}
                  disabled={isUpdating || !newAdminEmail.trim() || newAdminPassword.length < 8}
                >
                  Create local tenant admin
                </button>
              </div>

              <div className="admin-user-toolbar">
                <label className="admin-search-field">
                  <span>Search tenant admins</span>
                  <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, e-mail or provider" />
                </label>
                <div className="admin-section-actions">
                  <button type="button" className="secondary" onClick={() => setQuery("")} disabled={!query.trim()}>
                    Clear
                  </button>
                </div>
              </div>

              <div className="admin-users-list">
                {filteredTenantAdmins.length > 0 ? (
                  filteredTenantAdmins.map((assignment) => {
                    const user = assignment.user;
                    const isLocalOnly = user.hasLocalPassword && !user.hasAzureIdentity;
                    const isEditing = editingAdminUserId === assignment.userId;
                    const isSelf = session.user.id === assignment.userId;

                    return (
                      <article key={assignment.userId} className="admin-user-row">
                        <header>
                          <h4>{user.name || "-"}</h4>
                          <p>{user.email || "-"}</p>
                        </header>
                        <div className="admin-user-meta">
                          <span className="admin-pill is-admin">TENANT_ADMIN</span>
                          {user.hasLocalPassword ? <span className="admin-pill">LOCAL</span> : null}
                          {user.hasAzureIdentity ? <span className="admin-pill">AZURE_LINKED</span> : null}
                          {user.isSystemAdmin ? <span className="admin-pill is-admin">SYSTEM_ADMIN</span> : null}
                          {(user.providers.length > 0 ? user.providers : ["none"]).map((provider) => (
                            <span key={`${assignment.userId}-${provider}`} className="admin-pill">
                              {provider}
                            </span>
                          ))}
                        </div>
                        <p>Last login: {user.lastLoginAt ? formatDateTime(user.lastLoginAt) : "-"}</p>
                        <p>Assigned: {formatDateTime(assignment.createdAt)}</p>
                        {!isLocalOnly ? <p className="admin-meta">Only local-only accounts can be edited/deleted here.</p> : null}

                        {isEditing ? (
                          <>
                            <div className="admin-form-grid">
                              <label>
                                Name
                                <input value={editAdminName} onChange={(event) => setEditAdminName(event.target.value)} />
                              </label>
                              <label>
                                E-mail
                                <input
                                  value={editAdminEmail}
                                  onChange={(event) => setEditAdminEmail(event.target.value)}
                                  autoComplete="email"
                                />
                              </label>
                              <label>
                                New password (optional)
                                <input
                                  type="password"
                                  value={editAdminPassword}
                                  onChange={(event) => setEditAdminPassword(event.target.value)}
                                  placeholder="Leave blank to keep existing"
                                  autoComplete="new-password"
                                />
                              </label>
                            </div>
                            <div className="admin-user-actions">
                              <button
                                type="button"
                                onClick={() => void saveTenantAdminEdits(assignment.userId)}
                                disabled={isUpdating || !editAdminEmail.trim()}
                              >
                                Save
                              </button>
                              <button type="button" className="secondary" onClick={() => cancelEditTenantAdmin()} disabled={isUpdating}>
                                Cancel
                              </button>
                            </div>
                          </>
                        ) : (
                          <div className="admin-user-actions">
                            <button
                              type="button"
                              className="secondary"
                              onClick={() => startEditTenantAdmin(assignment)}
                              disabled={isUpdating || !isLocalOnly}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="secondary"
                              onClick={() => void deleteTenantAdminAccount(assignment)}
                              disabled={isUpdating || !isLocalOnly || isSelf}
                            >
                              Delete account
                            </button>
                          </div>
                        )}
                      </article>
                    );
                  })
                ) : (
                  <p className="admin-empty">No tenant admins match your filters.</p>
                )}
              </div>
            </div>
          ) : (
            <p className="admin-empty">Select a tenant to manage admins, settings and details.</p>
          )}
        </div>
      </section>
    </main>
  );
}
