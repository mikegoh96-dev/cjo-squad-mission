import { LiveSync } from "@/components/live/live-sync";

/** Dashboard + Mission: kept in sync with every other phone in real time. */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <LiveSync />
    </>
  );
}
