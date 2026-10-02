import { Card } from "@/components/ui";

/** Placeholder bar; `onPage` bars sit on the page background and need more contrast than in-card bars. */
function Bar({ className, onPage = false }: { className: string; onPage?: boolean }) {
  return <div className={`animate-shimmer rounded-full ${onPage ? "bg-hairline" : "bg-surface-2"} ${className}`} />;
}

/** Dashboard skeleton: mirrors the real layout so nothing jumps on load. */
export default function Loading() {
  return (
    <main
      className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 pt-[max(20px,env(safe-area-inset-top))] pb-32"
      aria-busy="true"
      data-testid="loading-state"
    >
      <span className="sr-only" role="status">
        Loading squad progress…
      </span>
      <div className="px-1 pt-2">
        <Bar onPage className="h-3 w-28" />
        <Bar onPage className="mt-3 h-8 w-60" />
        <Bar onPage className="mt-3 h-3 w-40" />
      </div>
      <div className="animate-shimmer bg-brand h-[300px] rounded-[32px] opacity-40" />
      <Card>
        <div className="flex items-center gap-3">
          <div className="animate-shimmer size-11 rounded-2xl bg-surface-2" />
          <Bar className="h-5 flex-1" />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="animate-shimmer h-16 rounded-2xl bg-surface-2" />
          <div className="animate-shimmer h-16 rounded-2xl bg-surface-2" />
        </div>
      </Card>
      {[0, 1, 2].map((i) => (
        <Card key={i} className="flex items-center gap-4 !p-4">
          <div className="animate-shimmer size-14 rounded-full bg-surface-2" />
          <Bar className="h-5 flex-1" />
        </Card>
      ))}
    </main>
  );
}
