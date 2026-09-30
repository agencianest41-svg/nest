import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncMetaInsights } from "@/lib/integrations/meta-sync";

// Rodada diária (Vercel Cron, ver vercel.json): puxa os insights de todas as
// marcas com a Meta conectada. A Vercel manda "Authorization: Bearer CRON_SECRET".
export const maxDuration = 300;

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const got = request.headers.get("authorization") ?? "";
  const want = `Bearer ${secret}`;
  return Boolean(secret) && got.length === want.length && timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  if (!admin) return Response.json({ error: "SUPABASE_SECRET_KEY ausente" }, { status: 500 });

  const { data: rows } = await admin.from("integrations").select("tenant_id")
    .eq("provider", "meta").is("operation_id", null).in("status", ["conectado", "erro"]);
  const report: Record<string, unknown> = {};
  for (const { tenant_id } of rows ?? []) {
    try {
      report[tenant_id] = await syncMetaInsights(admin, tenant_id);
    } catch (e) {
      report[tenant_id] = { error: e instanceof Error ? e.message : String(e) };
      console.error("[cron meta]", tenant_id, report[tenant_id]);
    }
  }
  return Response.json({ tenants: Object.keys(report).length, report });
}
