/**
 * The backend's own error text (apiFetch throws `new Error(json.error)`), or the fallback
 * when the error carries no readable message (network failure, bare "HTTP 500").
 */
export const apiErrorMessage = (error: unknown, fallback: string): string => {
  const message = error instanceof Error ? error.message : ''
  return message && !message.startsWith('[object') && !message.startsWith('HTTP ') ? message : fallback
}
