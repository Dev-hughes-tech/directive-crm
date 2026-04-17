export interface StorageResultLike {
  ok: boolean
  source: string | null
}

export function isDurableStorageSuccess(result: StorageResultLike): boolean {
  return result.ok && result.source === 'supabase'
}
