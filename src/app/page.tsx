import Link from "next/link";
import { siteConfig } from "@/config/site";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-12 sm:px-6 md:max-w-2xl">
      <p className="text-sm font-medium tracking-wide text-muted uppercase">
        Squad mission
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
        {siteConfig.name}
      </h1>
      <p className="mt-4 text-base leading-relaxed text-muted sm:text-lg">
        Our squad succeeds together.
      </p>
      <Link
        href="/squad"
        className="mt-8 self-start rounded-lg bg-foreground px-4 py-3 text-base font-medium text-background"
      >
        Go to my squad
      </Link>
    </main>
  );
}
