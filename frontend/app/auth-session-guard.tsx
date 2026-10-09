"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const SESSION_CHECK_INTERVAL_MS = 5_000;

export default function AuthSessionGuard() {
  const router = useRouter();

  useEffect(() => {
    let active = true;
    let checking = false;
    let authenticated = false;
    let lastLicenseActive: boolean | null = null;
    let interval: number | undefined;

    async function checkSession() {
      if (checking || document.visibilityState === "hidden") return;
      checking = true;
      try {
        const response = await fetch("/api/auth/me", { cache: "no-store" });
        if (!active) return;
        if (response.ok) {
          authenticated = true;
          const session = (await response.json()) as {
            is_admin: boolean;
            license_active: boolean;
          };
          if (
            !session.is_admin &&
            lastLicenseActive === true &&
            !session.license_active
          ) {
            window.dispatchEvent(
              new CustomEvent("optionflow:license-deactivated", {
                detail: session,
              }),
            );
            if (window.location.pathname !== "/") {
              router.replace("/");
            }
          }
          lastLicenseActive = session.license_active;
          return;
        }
        if (response.status !== 401) {
          console.error("Unable to verify the active login session.", response.status);
          return;
        }

        const pathname = window.location.pathname;
        if (authenticated) {
          authenticated = false;
          window.dispatchEvent(new Event("optionflow:session-expired"));
        }
        if (pathname !== "/" && pathname !== "/signup") {
          router.replace("/");
        }
      } catch (error) {
        if (active) console.error("Unable to verify the active login session.", error);
      } finally {
        checking = false;
      }
    }

    const initialCheck = window.setTimeout(() => {
      void checkSession();
      interval = window.setInterval(() => void checkSession(), SESSION_CHECK_INTERVAL_MS);
    }, 1_500);
    const checkWhenVisible = () => {
      if (document.visibilityState === "visible") void checkSession();
    };
    window.addEventListener("focus", checkWhenVisible);
    document.addEventListener("visibilitychange", checkWhenVisible);

    return () => {
      active = false;
      window.clearTimeout(initialCheck);
      if (interval !== undefined) window.clearInterval(interval);
      window.removeEventListener("focus", checkWhenVisible);
      document.removeEventListener("visibilitychange", checkWhenVisible);
    };
  }, [router]);

  return null;
}
