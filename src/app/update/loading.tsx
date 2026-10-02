import { Card } from "@/components/ui";

function Bar({ className }: { className: string }) {
  return <div className={`animate-shimmer rounded-full bg-surface-2 ${className}`} />;
}

/** Update screen skeleton. */
export default function Loading() {
  return (
    <main
      className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 pt-[max(20px,env(safe-area-inset-top))] pb-32"
      aria-busy="true"
      data-testid="loading-state"
    >
      <span className="sr-only" role="status">
        Loading…
      </span>
      <div className="px-1 pt-2">
        <div className="animate-shimmer h-3 w-24 rounded-full bg-hairline" />
        <div className="animate-shimmer mt-3 h-8 w-56 rounded-full bg-hairline" />
      </div>
      <Card className="flex items-center gap-3">
        <div className="animate-shimmer size-14 rounded-full bg-surface-2" />
        <Bar className="h-5 flex-1" />
      </Card>
      <Card>
        <Bar className="h-5 w-32" />
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="animate-shimmer h-24 rounded-2xl bg-surface-2" />
          <div className="animate-shimmer h-24 rounded-2xl bg-surface-2" />
        </div>
        <div className="animate-shimmer mt-5 h-14 rounded-2xl bg-surface-2" />
        <div className="animate-shimmer mt-5 h-14 rounded-2xl bg-surface-2" />
      </Card>
    </main>
  );
}
