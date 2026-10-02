import "server-only";
import { cache } from "react";
import { verifySession } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

export type CurrentMember = {
  userId: string;
  email: string | null;
  displayName: string;
  squad: { id: string; name: string } | null;
};

/**
 * The signed-in user's profile and squad. Queries run as the user, so RLS
 * only ever returns their own squad.
 */
export const getCurrentMember = cache(async (): Promise<CurrentMember> => {
  const { userId, email } = await verifySession();
  const supabase = await createClient();

  const [profile, membership] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name")
      .eq("id", userId)
      .single(),
    supabase
      .from("squad_members")
      .select("squads (id, name)")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  if (profile.error) throw profile.error;
  if (membership.error) throw membership.error;

  return {
    userId,
    email,
    displayName: profile.data.display_name,
    squad: membership.data?.squads ?? null,
  };
});
