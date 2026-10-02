import { Card } from "@/components/ui";

/** Placeholder bar; `onPage` bars sit on the page background and need more contrast than in-card bars. */
function Bar({ className, onPage = false }: { className: string; onPage?: boolean }) {
  return <div className={`animate-shimmer rounded-full ${onPage ? "bg-hairline" : "bg-surface-2"} ${className}`} />;
}

/** Dashboard skeleton: mirrors the real layout so nothing jumps on load. */
export default function Loading() {
  return (
    <main
      className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 pt-[max(24px,env(safe-area-inset-top))] pb-36"
      aria-busy="true"
      data-testid="loading-state"
    >
      <span className="sr-only" role="status">
        Loading squad progress…
      </span>
      <div className="px-1 pt-2">
        <Bar onPage className="h-3 w-24" />
        <Bar onPage className="mt-3 h-8 w-48" />
        <Bar onPage className="mt-3 h-3 w-40" />
      </div>
      <Card>
        <div className="flex justify-between">
          <Bar className="h-3 w-32" />
          <Bar className="h-7 w-28" />
        </div>
        <Bar className="mt-5 h-14 w-40" />
        <Bar className="mt-5 h-3.5 w-full" />
        <div className="mt-3 flex justify-between">
          <Bar className="h-5 w-12" />
          <Bar className="h-4 w-36" />
        </div>
      </Card>
      <Card>
        <Bar className="h-3 w-28" />
        <div className="mt-4 grid grid-cols-3 justify-items-center gap-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex flex-col items-center gap-2">
              <div className="animate-shimmer size-10 rounded-full bg-surface-2" />
              <Bar className="h-3 w-10" />
            </div>
          ))}
        </div>
      </Card>
      <Card>
        <Bar className="h-3 w-24" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="mt-4 flex items-center gap-3">
            <div className="animate-shimmer size-9 rounded-full bg-surface-2" />
            <Bar className="h-4 flex-1" />
            <Bar className="h-4 w-16" />
          </div>
        ))}
      </Card>
    </main>
  );
}
