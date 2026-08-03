import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import { LEGAL_VERSION } from "@/lib/legal";

export type LegalDocument = "terms" | "privacy";

export interface LegalAcceptance {
  id: string;
  orgId: string;
  userId: string;
  email: string;
  document: LegalDocument;
  version: string;
  acceptedAt: Date;
}

function mapAcceptance(row: Record<string, unknown>): LegalAcceptance {
  return {
    id: row.id as string,
    orgId: row.org_id as string,
    userId: row.user_id as string,
    email: row.email as string,
    document: row.document as LegalDocument,
    version: row.version as string,
    acceptedAt: new Date(row.accepted_at as string),
  };
}

/** Both documents are accepted together; the checkbox names both. */
const DOCUMENTS: LegalDocument[] = ["terms", "privacy"];

/**
 * Records that someone accepted the current terms and privacy notice.
 *
 * The version comes from LEGAL_VERSION on the server, never from the client.
 * A caller claiming to have accepted "v1999-01-01" would otherwise write its
 * own alibi, and the whole point of the record is that it says what was
 * actually on the page at the time.
 *
 * Re-accepting the same version is a no-op rather than an error: someone who
 * signs up, abandons the flow and comes back should not hit a duplicate-key
 * failure on the second attempt.
 */
export async function recordLegalAcceptance(input: {
  orgId: string;
  userId: string;
  email: string;
}): Promise<void> {
  const { error } = await createAdminClient()
    .from("legal_acceptances")
    .upsert(
      DOCUMENTS.map((document) => ({
        org_id: input.orgId,
        user_id: input.userId,
        email: input.email,
        document,
        version: LEGAL_VERSION,
      })),
      { onConflict: "org_id,user_id,document,version", ignoreDuplicates: true },
    );

  if (error)
    throw new Error(`Failed to record legal acceptance: ${error.message}`);
}

/**
 * Every acceptance in one organization, newest first.
 *
 * Session-bound, so RLS answers "which org" rather than this function
 * trusting an org id passed in — the same shape as every other read here.
 */
export async function listLegalAcceptancesForOrg(
  orgId: string,
): Promise<LegalAcceptance[]> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from("legal_acceptances")
    .select("*")
    .eq("org_id", orgId)
    .order("accepted_at", { ascending: false })
    // accepted_at ties when both documents are written in one statement, and
    // a tie without a tiebreaker means no total order — which is how a row
    // ends up on two pages of the same list.
    .order("id");

  if (error)
    throw new Error(`Failed to load legal acceptances: ${error.message}`);
  return (data ?? []).map(mapAcceptance);
}
