import { AppShell } from "@/components/layout/app-shell";
import { Suspense } from "react";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={null}><AppShell>{children}</AppShell></Suspense>;
}
