export interface SettledSection<T> {
  value: T
  failed: boolean
}

export function resolveSettledSection<T>(
  result: PromiseSettledResult<T>,
  fallback: T,
): SettledSection<T> {
  if (result.status === 'fulfilled') {
    return { value: result.value, failed: false }
  }

  return { value: fallback, failed: true }
}
