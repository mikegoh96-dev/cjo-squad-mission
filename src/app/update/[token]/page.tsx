import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSquadMonth, getUpdateContext } from "@/lib/data/update-link";
import { monthLabel } from "@/lib/progress";
import { NoOpenMonth } from "../no-open-month";
import { UpdateScreen } from "../update-screen";

export const metadata: Metadata = {
  title: "Update my cases",
  robots: { index: false, follow: false },
};

// Private per-member page: the URL token is the credential.
export default async function UpdateByLinkPage({ params }: PageProps<"/update/[token]">) {
  const { token } = await params;
  const context = await getUpdateContext(token);
  if (!context) notFound(); // malformed, unknown and revoked links look the same

  if (!context.month) return <NoOpenMonth memberName={context.memberName} squadName={context.squadName} />;

  const squad = await getSquadMonth(context.squadName, context.month);
  return (
    <UpdateScreen
      token={token}
      memberName={context.memberName}
      squadName={context.squadName}
      monthLabel={monthLabel(context.month)}
      initialCount={context.caseCount}
      squad={squad}
    />
  );
}
