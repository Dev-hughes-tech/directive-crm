export interface ResearchJobAccessRecord {
  id: string
  owner_id: string | null
  address: string
}

export interface ResearchJobStatusRecord {
  id: string
  status: string
  result: unknown
  error_message: string | null
}

export interface AuthorizedResearchJob {
  jobId: string
  ownerId: string
  address: string
}

export async function authorizeResearchJob(
  job: ResearchJobAccessRecord | null,
  canAccessOwner: (ownerId: string) => Promise<boolean>,
): Promise<AuthorizedResearchJob | null> {
  if (!job?.owner_id) return null

  const address = job.address.trim()
  if (!address) return null

  const allowed = await canAccessOwner(job.owner_id)
  if (!allowed) return null

  return {
    jobId: job.id,
    ownerId: job.owner_id,
    address,
  }
}

export function buildResearchJobStatusPayload(job: ResearchJobStatusRecord) {
  return {
    jobId: job.id,
    status: job.status,
    data: job.result ?? null,
    error: job.error_message ?? null,
  }
}
