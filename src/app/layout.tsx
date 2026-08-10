import "./globals.css";
import { ToastProvider } from "@/components/ui/Toast";

export const metadata = {
  title: "Notary Financial Control",
  description: "Financial Position & Transaction Traceability",
};

// Root layout: minimal, shared by both /login (no shell) and the
// authenticated (app) route group (full sidebar+header shell, see
// src/app/(app)/layout.tsx). ToastProvider lives here so it's available everywhere.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
