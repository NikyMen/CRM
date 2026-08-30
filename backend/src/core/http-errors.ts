export type HttpClientError = {
  statusCode: number
  message: string
  code?: string
}

export function isHttpClientError(error: unknown): error is HttpClientError {
  if (!error || typeof error !== 'object') return false
  const candidate = error as Partial<HttpClientError>
  return Number.isInteger(candidate.statusCode)
    && candidate.statusCode! >= 400
    && candidate.statusCode! < 500
    && typeof candidate.message === 'string'
}

export function httpClientErrorCode(error: HttpClientError) {
  if (typeof error.code === 'string' && error.code.trim()) return error.code
  return error.statusCode === 429 ? 'RATE_LIMITED' : `HTTP_${error.statusCode}`
}
