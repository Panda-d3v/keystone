import type { Metadata } from "next";
import type { ReactNode } from "react";
export const metadata: Metadata = { title: "Keystone", description: "Decision integrity for industrial procurement" };
export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
