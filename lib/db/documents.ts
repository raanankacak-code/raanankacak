import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import type { ProjectDocument } from "@/lib/db/types";
import { isUuid } from "@/lib/uuid";
import { fetchAllRows } from "@/lib/db/paging";

function mapDocument(row: Record<string, unknown>): ProjectDocument {
  return {
    id: row.id as string,
    orgId: row.org_id as string,
    projectId: row.project_id as string,
    folder: row.folder as string,
    name: row.name as string,
    url: row.url as string,
    sizeBytes: Number(row.size_bytes),
    mimeType: row.mime_type as string | null,
    uploadedById: row.uploaded_by_id as string,
    uploadedByName: row.uploaded_by_name as string,
    createdAt: new Date(row.created_at as string),
  };
}

export async function listDocumentsForProject(
  projectId: string,
): Promise<ProjectDocument[]> {
  const data = await fetchAllRows<Record<string, unknown>>((from, to) =>
    createAdminClient()
      .from("documents")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .range(from, to),
  );
  return data.map(mapDocument);
}

/** Tenant-isolation pilot rollout (see listProjectsForOrgViaSession in projects.ts). */
export async function listDocumentsForProjectViaSession(
  projectId: string,
): Promise<ProjectDocument[]> {
  const supabase = await createSessionClient();
  const data = await fetchAllRows<Record<string, unknown>>((from, to) =>
    supabase
      .from("documents")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .range(from, to),
  );
  return data.map(mapDocument);
}

export async function listDocumentsForOrg(
  orgId: string,
): Promise<ProjectDocument[]> {
  const data = await fetchAllRows<Record<string, unknown>>((from, to) =>
    createAdminClient()
      .from("documents")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .range(from, to),
  );
  return data.map(mapDocument);
}

export async function createDocument(
  orgId: string,
  projectId: string,
  input: {
    folder: string;
    name: string;
    url: string;
    sizeBytes: number;
    mimeType?: string;
    uploadedById: string;
    uploadedByName: string;
  },
): Promise<ProjectDocument> {
  const { data, error } = await createAdminClient()
    .from("documents")
    .insert({
      org_id: orgId,
      project_id: projectId,
      folder: input.folder,
      name: input.name,
      url: input.url,
      size_bytes: input.sizeBytes,
      mime_type: input.mimeType,
      uploaded_by_id: input.uploadedById,
      uploaded_by_name: input.uploadedByName,
    })
    .select("*")
    .single();
  if (error) throw error;
  return mapDocument(data);
}

export async function getDocumentById(
  orgId: string,
  id: string,
): Promise<ProjectDocument | null> {
  // A malformed id can match no row; do not let Postgres throw over it.
  if (!isUuid(id)) return null;
  const { data, error } = await createAdminClient()
    .from("documents")
    .select("*")
    .eq("id", id)
    .eq("org_id", orgId)
    .maybeSingle();
  if (error) throw error;
  return data ? mapDocument(data) : null;
}

export async function deleteDocument(orgId: string, id: string): Promise<void> {
  const { error } = await createAdminClient()
    .from("documents")
    .delete()
    .eq("id", id)
    .eq("org_id", orgId);
  if (error) throw error;
}
