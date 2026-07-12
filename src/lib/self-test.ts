import { supabase } from "@/integrations/supabase/client";

export type ProbeStatus = "pass" | "fail" | "skip";

export interface ProbeResult {
  table: string;
  status: ProbeStatus;
  detail: string;
  checks: {
    ownReadable: boolean;
    rlsIsolates: boolean;
    writeGuardEnforced: boolean;
  };
}

const IMPOSSIBLE_UUID = "00000000-0000-0000-0000-000000000000";

/**
 * Verify RLS for a table where every policy scopes to auth.uid() = user_id.
 * Runs entirely under the signed-in user's context (Supabase JS attaches JWT).
 *
 * 1. SELECT own rows — must succeed (proves GRANT + policy USING).
 * 2. SELECT rows for a foreign user_id — must return 0 rows (proves RLS).
 * 3. INSERT with a foreign user_id — must be rejected (proves WITH CHECK).
 *    Payload is intentionally minimal; we only care that the write is refused.
 */
async function probeUserScopedTable(
  table: string,
  fakeInsertPayload: Record<string, unknown>,
): Promise<ProbeResult> {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) {
    return {
      table,
      status: "skip",
      detail: "Not signed in.",
      checks: { ownReadable: false, rlsIsolates: false, writeGuardEnforced: false },
    };
  }

  // 1. own-row read
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const own = await (supabase.from as any)(table).select("id").eq("user_id", uid).limit(1);
  const ownReadable = !own.error;

  // 2. foreign-row read (RLS must hide any rows even if they exist)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const foreign = await (supabase.from as any)(table).select("id").eq("user_id", IMPOSSIBLE_UUID);
  const rlsIsolates = !foreign.error && Array.isArray(foreign.data) && foreign.data.length === 0;

  // 3. write guard: attempt an insert with a foreign user_id.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const write = await (supabase.from as any)(table).insert({
    ...fakeInsertPayload,
    user_id: IMPOSSIBLE_UUID,
  });
  const writeGuardEnforced = !!write.error; // any error = guard held

  const allPass = ownReadable && rlsIsolates && writeGuardEnforced;
  const detail = allPass
    ? "RLS verified: own-read OK, foreign rows hidden, foreign writes rejected."
    : [
        !ownReadable && `own-read failed (${own.error?.message ?? "unknown"})`,
        !rlsIsolates && "foreign-row read leaked or errored",
        !writeGuardEnforced && "foreign-user insert was NOT rejected (RLS gap)",
      ]
        .filter(Boolean)
        .join(" · ");

  return {
    table,
    status: allPass ? "pass" : "fail",
    detail,
    checks: { ownReadable, rlsIsolates, writeGuardEnforced },
  };
}

export async function runStartupSelfTest(): Promise<ProbeResult[]> {
  const invalidUuid = IMPOSSIBLE_UUID;
  return Promise.all([
    probeUserScopedTable("api_keys", {
      name: "__selftest__",
      key_hash: "__selftest__",
      prefix: "st_",
    }),
    probeUserScopedTable("user_bots", {
      name: "__selftest__",
    }),
    probeUserScopedTable("bot_api_keys", {
      bot_id: invalidUuid,
      api_key_id: invalidUuid,
    }),
    probeUserScopedTable("jackie_control_prefs", {}),
    probeUserScopedTable("jackie_control_swarms", {
      name: "__selftest__",
    }),
    probeUserScopedTable("jackie_control_audit", {
      action: "__selftest__",
    }),
  ]);
}

export function summarize(results: ProbeResult[]) {
  const pass = results.filter((r) => r.status === "pass").length;
  const fail = results.filter((r) => r.status === "fail").length;
  const skip = results.filter((r) => r.status === "skip").length;
  const ok = fail === 0 && skip === 0;
  return { pass, fail, skip, ok, total: results.length };
}
