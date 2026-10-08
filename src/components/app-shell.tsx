import { UpdateButton } from "@/components/app-update";
import { BottomNav } from "@/components/nav/bottom-nav";

/** Page frame: centred mobile column, page header, bottom navigation. */
export function AppShell({
  eyebrow,
  title,
  subtitle,
  aside,
  nav = true,
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle?: React.ReactNode;
  aside?: React.ReactNode;
  nav?: boolean;
  children: React.ReactNode;
}) {
  return (
    <>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 pt-[max(20px,env(safe-area-inset-top))] pb-32">
        <header className="animate-rise flex items-start justify-between gap-3 px-1 pt-2">
          <div className="min-w-0">
            <p className="text-[12px] font-bold tracking-[0.14em] text-accent uppercase">{eyebrow}</p>
            <h1 className="mt-1 text-[30px] leading-[1.1] font-extrabold tracking-tight">{title}</h1>
            {subtitle ? <p className="mt-1.5 text-[14px] text-muted">{subtitle}</p> : null}
          </div>
          {aside}
        </header>
        {children}
        {nav ? <UpdateButton /> : null}
      </main>
      {nav ? <BottomNav /> : null}
    </>
  );
}
