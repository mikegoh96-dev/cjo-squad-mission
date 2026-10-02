#!/usr/bin/env node
// Admin CLI for squads and members.
//
//   npm run members -- list
//   npm run members -- add "<squad name>" "<member name>"
//   npm run members -- rename <squad_member_id> "<new name>"
//   npm run members -- remove <squad_member_id>   (also deletes their counts + history)
//
// Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (read from .env.local).
// The secret key is for this admin script only: never prefix it with
// NEXT_PUBLIC_, never add it to Vercel, never commit it.
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
if (!url || !secretKey) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (e.g. in .env.local).");
  process.exit(1);
}
const db = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });

async function main([command, ...args]) {
  switch (command) {
    case "list": {
      const { data, error } = await db
        .from("squad_members")
        .select("id, squads (name), members (display_name)")
        .order("created_at");
      if (error) throw error;
      console.table(data.map((r) => ({ squad: r.squads.name, member: r.members.display_name, squad_member_id: r.id })));
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
    case "rename": {
      const [id, name] = args;
      if (!id || !name) throw new Error('usage: rename <squad_member_id> "<new name>"');
      const sm = await db.from("squad_members").select("member_id").eq("id", id).single();
      if (sm.error) throw sm.error;
      const { error } = await db.from("members").update({ display_name: name }).eq("id", sm.data.member_id);
      if (error) throw error;
      console.log(`Renamed to ${name}.`);
      return;
    }
    case "remove": {
      const [id] = args;
      if (!id) throw new Error("usage: remove <squad_member_id>");
      const sm = await db.from("squad_members").select("member_id").eq("id", id).single();
      if (sm.error) throw sm.error;
      const del = await db.from("squad_members").delete().eq("id", id);
      if (del.error) throw del.error;
      const m = await db.from("members").delete().eq("id", sm.data.member_id);
      if (m.error) throw m.error;
      console.log("Removed (their counts and history were deleted with them).");
      return;
    }
    default:
      console.log('Commands: list | add "<squad>" "<member>" | rename <squad_member_id> "<name>" | remove <squad_member_id>');
      process.exitCode = command ? 1 : 0;
  }
}

main(process.argv.slice(2)).catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
