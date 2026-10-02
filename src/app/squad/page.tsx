import type { Metadata } from "next";
import { signOut } from "@/lib/auth/actions";
import { getCurrentMember } from "@/lib/data/current-member";

export const metadata: Metadata = {
  title: "My squad",
};

// Authenticated home. The squad dashboard will be built here.
export default async function SquadPage() {
  const member = await getCurrentMember();

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-12 sm:px-6 md:max-w-2xl">
      <p className="text-sm text-muted">Signed in as {member.displayName}</p>
      {member.squad ? (
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
          {member.squad.name}
        </h1>
      ) : (
        <>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            You&apos;re not in a squad yet
          </h1>
          <p className="mt-3 text-base leading-relaxed text-muted">
            Ask your squad admin to add you. Then refresh this page.
          </p>
        </>
      )}
      <form action={signOut} className="mt-8">
        <button
          type="submit"
          className="rounded-lg border border-muted/40 px-4 py-2 text-sm font-medium"
        >
          Sign out
        </button>
      </form>
    </main>
  );
}
