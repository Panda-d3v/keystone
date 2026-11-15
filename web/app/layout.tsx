import type { Metadata } from "next";
import type { ReactNode } from "react";
export const metadata: Metadata = { title: "Keystone", description: "Decision integrity for industrial procurement" };
// Styles live with each area: app/(platform) uses Bootstrap; the archived design
// versions under /1-/5 and /versions import ./globals.css in their own layouts.
export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
