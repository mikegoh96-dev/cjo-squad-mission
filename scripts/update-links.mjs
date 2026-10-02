#!/usr/bin/env node
// Admin CLI for squad members and their private update links.
//
//   npm run links -- list
//   npm run links -- add "<squad name>" "<member name>"
//   npm run links -- issue <squad_member_id>     (new link; old one stops working)
//   npm run links -- revoke <squad_member_id>
//
// Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (read from .env.local).
// The secret key is for this admin script only: never prefix it with
// NEXT_PUBLIC_, never add it to Vercel, never commit it.
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const siteUrl = (process.env.SITE_URL ?? "https://cjo-squad-mission-pi.vercel.app").replace(/\/$/, "");
if (!url || !secretKey) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (e.g. in .env.local).");
  process.exit(1);
}
const db = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });

async function main([command, ...args]) {
  switch (command) {
    case "list": {
      const { data, error } = await db.rpc("admin_update_link_status");
      if (error) throw error;
      console.table(data.map((r) => ({
        squad: r.squad_name,
        member: r.member_name,
        squad_member_id: r.squad_member_id,
        link: r.link_issued_at ? `active since ${r.link_issued_at}` : "none",
      })));
      return;
    }
    case "add": {
      const [squadName, memberName] = args;
      if (!squadName || !memberName) throw new Error('usage: add "<squad name>" "<member name>"');
      const squad = await db.from("squads").upsert({ name: squadName }, { onConflict: "name" }).select("id").single();
      if (squad.error) throw squad.error;
      const member = await db.from("members").insert({ display_name: memberName }).select("id").single();
      if (member.error) throw member.error;
      const sm = await db.from("squad_members").insert({ squad_id: squad.data.id, member_id: member.data.id }).select("id").single();
      if (sm.error) throw sm.error;
      console.log(`Added ${memberName} to ${squadName}. squad_member_id: ${sm.data.id}`);
      return;
    }
    case "issue": {
      const [id] = args;
      if (!id) throw new Error("usage: issue <squad_member_id>");
      const { data: token, error } = await db.rpc("admin_issue_update_token", { p_squad_member_id: id });
      if (error) throw error;
      console.log("New private update link (shown once; any previous link no longer works):");
      console.log(`${siteUrl}/update/${token}`);
      return;
    }
    case "revoke": {
      const [id] = args;
      if (!id) throw new Error("usage: revoke <squad_member_id>");
      const { data, error } = await db.rpc("admin_revoke_update_token", { p_squad_member_id: id });
      if (error) throw error;
      console.log(data ? "Link revoked." : "That member had no active link.");
      return;
    }
    default:
      throw new Error("commands: list | add <squad> <member> | issue <squad_member_id> | revoke <squad_member_id>");
  }
}

main(process.argv.slice(2)).catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
