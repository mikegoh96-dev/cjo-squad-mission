import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getUpdateContext } from "@/lib/data/update-link";
import { monthLabel } from "@/lib/progress";
import { UpdateForm } from "./update-form";

export const metadata: Metadata = {
  title: "Update my cases",
  robots: { index: false, follow: false },
};

// Private per-member page: the URL token is the credential.
export default async function UpdatePage({ params }: PageProps<"/update/[token]">) {
  const { token } = await params;
  const context = await getUpdateContext(token);
  if (!context) notFound(); // malformed, unknown and revoked links look the same

  return (
    <main className="mx-auto w-full max-w-sm flex-1 px-4 py-10">
      <p className="text-sm text-muted">{context.squadName}</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight uppercase">{context.memberName}</h1>
      {context.month ? (
        <UpdateForm
          token={token}
          monthLabel={monthLabel(context.month)}
          initialCount={context.caseCount}
        />
      ) : (
        <>
          <p className="mt-6 text-muted">There is no campaign month open right now.</p>
          <Link href="/" className="mt-6 inline-block underline">
            Back to squad dashboard
          </Link>
        </>
      )}
    </main>
  );
}
