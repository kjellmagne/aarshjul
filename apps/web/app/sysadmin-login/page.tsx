"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn, signOut, useSession } from "next-auth/react";
import { useEffect, useState } from "react";

export default function SysAdminLoginPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [username, setUsername] = useState("sysadmin");
  const [password, setPassword] = useState("sysadmin");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const isSystemAdmin = Boolean(session?.user?.isSystemAdmin);
  const isSignedInAsOtherUser = status === "authenticated" && !isSystemAdmin;

  useEffect(() => {
    if (status === "authenticated" && isSystemAdmin) {
      router.replace("/sysadmin");
    }
  }, [router, status, isSystemAdmin]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedUsername = username.trim().toLowerCase();
    if (!trimmedUsername || !password) {
      setError("Ugyldig brukernavn eller passord.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const health = await fetch("/api/tenant", { cache: "no-store" });
      if (!health.ok) {
        setError("Backend/database er ikke tilgjengelig. Start PostgreSQL og prøv igjen.");
        return;
      }
      if (status === "authenticated") {
        await signOut({ redirect: false });
      }
      const result = await signIn("sysadmin-local", {
        redirect: false,
        username: trimmedUsername,
        password
      });
      if (!result || result.error) {
        setError("Systemadmin-innlogging feilet. Sjekk brukernavn/passord i apps/web/.env.local og restart appen.");
        return;
      }
      router.push("/sysadmin");
    } catch {
      setError("Systemadmin-innlogging feilet. Sjekk brukernavn/passord i apps/web/.env.local og restart appen.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="wheel-page-auth">
      <section className="auth-card auth-card-modern">
        <header className="auth-brand-row">
          <span className="auth-brand-mark" aria-hidden>
            <svg viewBox="0 0 64 64" role="presentation" focusable="false">
              <circle cx="32" cy="32" r="28" fill="#0a1135" />
              <circle cx="32" cy="12" r="4" fill="#ffffff" />
              <circle cx="50" cy="20" r="4" fill="#ffffff" />
              <circle cx="54" cy="36" r="4" fill="#ffffff" />
              <circle cx="42" cy="50" r="4" fill="#ffffff" />
              <circle cx="22" cy="52" r="4" fill="#ffffff" />
              <circle cx="10" cy="40" r="4" fill="#ffffff" />
              <circle cx="10" cy="24" r="4" fill="#ffffff" />
              <circle cx="20" cy="14" r="4" fill="#ffffff" />
              <circle cx="32" cy="32" r="7" fill="#ffffff" />
            </svg>
          </span>
          <h1>SYSTEMADMIN</h1>
        </header>
        <p className="auth-subtitle">Egen lokal innlogging for systemadministrator.</p>

        <section className="auth-sysadmin-panel">
          <h2>Systemadmin lokal innlogging</h2>
          <p>Standard: sysadmin / sysadmin (kan endres i apps/web/.env.local)</p>
          {isSignedInAsOtherUser ? (
            <p className="auth-provider-note">Du er innlogget som annen bruker. Systemadmin-login vil bytte aktiv bruker.</p>
          ) : null}
          <form className="auth-form auth-sysadmin-form" onSubmit={onSubmit}>
            <label>
              <span>Brukernavn</span>
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                placeholder="Brukernavn"
                required
              />
            </label>
            <label>
              <span>Passord</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                placeholder="Passord"
                required
              />
            </label>
            {error ? <p className="auth-error">{error}</p> : null}
            <button type="submit" className="auth-secondary-button" disabled={busy || status === "loading"}>
              Logg inn som systemadmin
            </button>
          </form>
        </section>

        <Link href="/" className="auth-mode-toggle auth-mode-toggle-modern auth-sysadmin-open-link">
          Tilbake til hovedinnlogging
        </Link>
      </section>
    </main>
  );
}
