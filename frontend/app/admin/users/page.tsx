"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import pageStyles from "../../page.module.css";

type AdminUser = {
  id: number;
  email: string;
  mobile_number: string | null;
  license_active: boolean;
  license_expires_at: string | null;
  created_at: string;
};

type SessionUser = {
  is_admin: boolean;
};

export default function AdminUsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [durationDays, setDurationDays] = useState<Record<number, string>>({});
  const [temporaryPasswords, setTemporaryPasswords] = useState<Record<number, string>>({});
  const [error, setError] = useState("");

  const loadUsers = useCallback(async () => {
    setError("");
    try {
      const sessionResponse = await fetch("/api/auth/me", { cache: "no-store" });
      if (!sessionResponse.ok) {
        router.replace("/");
        return;
      }
      const session = (await sessionResponse.json()) as SessionUser;
      if (!session.is_admin) {
        router.replace("/");
        return;
      }
      const response = await fetch("/api/admin/users", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(
          typeof body.detail === "string" ? body.detail : "Unable to load users.",
        );
      }
      setUsers(body as AdminUser[]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load users.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadUsers(), 0);
    return () => window.clearTimeout(timer);
  }, [loadUsers]);

  async function updateLicense(user: AdminUser, active: boolean) {
    const days = Number(durationDays[user.id] ?? "30");
    if (active && (!Number.isInteger(days) || days < 1 || days > 3650)) {
      setError("License duration must be between 1 and 3650 days.");
      return;
    }
    setSavingId(user.id);
    setError("");
    try {
      const response = await fetch(`/api/admin/users/${user.id}/license`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active, ...(active ? { duration_days: days } : {}) }),
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(
          typeof body.detail === "string" ? body.detail : "Unable to update license.",
        );
      }
      setUsers((current) =>
        current.map((item) => (item.id === user.id ? (body as AdminUser) : item)),
      );
      setTemporaryPasswords((current) => {
        const next = { ...current };
        delete next[user.id];
        return next;
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to update license.");
    } finally {
      setSavingId(null);
    }
  }

  async function resetPassword(user: AdminUser) {
    if (!window.confirm(`Generate a temporary password for ${user.email}? This signs them out of all devices.`)) {
      return;
    }
    setSavingId(user.id);
    setError("");
    try {
      const response = await fetch(`/api/admin/users/${user.id}/password-reset`, {
        method: "POST",
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(
          typeof body.detail === "string" ? body.detail : "Unable to reset password.",
        );
      }
      setTemporaryPasswords((current) => ({
        ...current,
        [user.id]: body.temporary_password as string,
      }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to reset password.");
    } finally {
      setSavingId(null);
    }
  }

  async function deleteUser(user: AdminUser) {
    if (!window.confirm(`Permanently delete ${user.email} and revoke their sessions?`)) {
      return;
    }
    setSavingId(user.id);
    setError("");
    try {
      const response = await fetch(`/api/admin/users/${user.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(
          typeof body?.detail === "string" ? body.detail : "Unable to delete user.",
        );
      }
      setUsers((current) => current.filter((item) => item.id !== user.id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to delete user.");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <main className={pageStyles.appPage}>
      <div className={pageStyles.appShell}>
        <header className={pageStyles.topbar}>
          <div className={pageStyles.brand}>OPTION<span>FLOW</span></div>
          <Link className={pageStyles.historicalLink} href="/">← Dashboard</Link>
        </header>
        <section className={pageStyles.licensePanel} aria-label="User license management">
          <div className={pageStyles.licenseHeading}>
            <div>
              <p className={pageStyles.eyebrow}>ADMINISTRATION</p>
              <h1>License requests</h1>
            </div>
            <span>{users.filter((user) => !user.license_active).length} pending</span>
          </div>
          {error && <p className={pageStyles.connectionError} role="alert">{error}</p>}
          {loading ? (
            <p className={pageStyles.muted}>Loading user accounts…</p>
          ) : users.length === 0 ? (
            <p className={pageStyles.muted}>No registered users yet.</p>
          ) : (
            <div className={pageStyles.licenseList}>
              {users.map((user) => (
                <div className={pageStyles.licenseRow} key={user.id}>
                  <div>
                    <strong>Login ID: {user.email}</strong>
                    <span>
                      User ID {user.id} · Mobile {user.mobile_number ?? "Not provided"}
                    </span>
                    <span>
                      Signed up {new Date(user.created_at).toLocaleDateString()}
                      {" · "}License {user.license_active ? "active" : user.license_expires_at ? "expired" : "activation pending"}
                    </span>
                    <span>
                      <strong>Expiry date:</strong>{" "}
                      {user.license_expires_at
                        ? new Date(user.license_expires_at).toLocaleDateString()
                        : user.license_active
                          ? "Not set — renew the license to calculate"
                          : "Set when the license is activated"}
                    </span>
                    {temporaryPasswords[user.id] && (
                      <span className={pageStyles.temporaryPassword} role="status">
                        Temporary password (shown once): <strong>{temporaryPasswords[user.id]}</strong>
                        Share it securely; the user must change it at sign-in.
                      </span>
                    )}
                  </div>
                  <div className={pageStyles.userActions}>
                    <button
                      className={pageStyles.connectButton}
                      onClick={() => void updateLicense(user, true)}
                      disabled={savingId === user.id}
                    >
                      {savingId === user.id
                        ? "Saving…"
                        : user.license_active
                          ? "Renew license"
                          : "Activate"}
                    </button>
                    {user.license_active && (
                      <button
                        className={pageStyles.subtleButton}
                        onClick={() => void updateLicense(user, false)}
                        disabled={savingId === user.id}
                      >
                        Deactivate
                      </button>
                    )}
                    <label className={pageStyles.licenseDuration}>
                      Days
                      <input
                        type="number"
                        min={1}
                        max={3650}
                        step={1}
                        value={durationDays[user.id] ?? "30"}
                        onChange={(event) =>
                          setDurationDays((current) => ({
                            ...current,
                            [user.id]: event.target.value,
                          }))
                        }
                        disabled={savingId === user.id}
                      />
                    </label>
                    <button
                      className={pageStyles.subtleButton}
                      onClick={() => void resetPassword(user)}
                      disabled={savingId === user.id}
                    >
                      Reset password
                    </button>
                    <button
                      className={pageStyles.deleteUserButton}
                      onClick={() => void deleteUser(user)}
                      disabled={savingId === user.id}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <button className={pageStyles.subtleButton} onClick={() => void loadUsers()}>
            Refresh list
          </button>
        </section>
      </div>
    </main>
  );
}
