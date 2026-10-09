"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "../page.module.css";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      const registration = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, mobile_number: mobileNumber, password }),
      });
      const registrationBody = await registration.json();
      if (!registration.ok) {
        throw new Error(
          typeof registrationBody.detail === "string"
            ? registrationBody.detail
            : "Unable to create your account.",
        );
      }

      const login = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const loginBody = await login.json();
      if (!login.ok) {
        throw new Error(
          typeof loginBody.detail === "string"
            ? loginBody.detail
            : "Account created. Please sign in.",
        );
      }
      router.replace("/");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to create your account.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <div className={styles.brand}>OPTION<span>FLOW</span></div>
        <p className={styles.eyebrow}>Create your account</p>
        <h1>Start exploring.</h1>
        <p className={styles.muted}>
          Your account will be ready after an administrator activates market-data access.
        </p>
        <form onSubmit={submit} className={styles.form}>
          <label htmlFor="signup-email">Email address</label>
          <input
            id="signup-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            autoComplete="email"
          />
          <label htmlFor="signup-mobile">Mobile number</label>
          <input
            id="signup-mobile"
            type="tel"
            value={mobileNumber}
            onChange={(event) => setMobileNumber(event.target.value)}
            required
            minLength={7}
            maxLength={20}
            autoComplete="tel"
            placeholder="+91 98765 43210"
          />
          <label htmlFor="signup-password">Password</label>
          <input
            id="signup-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={8}
            maxLength={128}
            autoComplete="new-password"
          />
          <label htmlFor="signup-confirm-password">Retype password</label>
          <input
            id="signup-confirm-password"
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            required
            minLength={8}
            maxLength={128}
            autoComplete="new-password"
          />
          {error && <p className={styles.error} role="alert">{error}</p>}
          <button className={styles.primaryButton} disabled={submitting}>
            {submitting ? "Creating account…" : "Create account"}
          </button>
        </form>
        <Link className={styles.linkButton} href="/">
          Already have an account? Sign in
        </Link>
      </section>
    </main>
  );
}
