import type { Metadata } from "next";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import AuthSessionGuard from "./auth-session-guard";
import "./globals.css";

const themes = new Set([
  "glossy-milk",
  "midnight",
  "soft-sage",
  "ocean",
  "lavender",
  "warm-sand",
  "high-contrast",
]);

export const metadata: Metadata = {
  title: "OptionFlow",
  description: "A secure options workspace",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const cookieStore = await cookies();
  const savedTheme = cookieStore.get("optionflow-theme")?.value;
  const theme = savedTheme && themes.has(savedTheme) ? savedTheme : "glossy-milk";
  return (
    <html lang="en" data-theme={theme}>
      <body>
        <AuthSessionGuard />
        {children}
      </body>
    </html>
  );
}
