// Fetch helpers: concurrency limit + retry with backoff for network errors, 429 and 5xx.
// The pokemontcg.io API was observed returning frequent transient 500/502 responses.

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export function friendlyError(err: unknown): string {
  if (err instanceof ApiError) return err.message
  return 'Erro inesperado ao consultar a API de cartas. Tente novamente.'
}

export function createLimiter(max: number) {
  let active = 0
  const queue: (() => void)[] = []
  const next = () => {
    if (active >= max) return
    const run = queue.shift()
    if (run) {
      active += 1
      run()
    }
  }
  return function limit<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      queue.push(() => {
        task()
          .then(resolve, reject)
          .finally(() => {
            active -= 1
            next()
          })
      })
      next()
    })
  }
}

export interface RetryOptions {
  retries?: number
  baseDelayMs?: number
  fetchImpl?: typeof fetch
  sleep?: (ms: number) => Promise<void>
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export async function fetchJsonWithRetry<T>(url: string, init: RequestInit, opts: RetryOptions = {}): Promise<T> {
  const { retries = 4, baseDelayMs = 1000, fetchImpl = fetch, sleep = defaultSleep } = opts
  let lastError: ApiError | undefined

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      const retryAfter = lastError?.status === 429 ? 2 : 1
      await sleep(baseDelayMs * retryAfter * 2 ** (attempt - 1))
    }
    let res: Response
    try {
      res = await fetchImpl(url, init)
    } catch {
      lastError = new ApiError('Falha de rede ao acessar a API de cartas. Verifique sua conexão.')
      continue
    }
    if (res.ok) return (await res.json()) as T
    if (res.status === 429) {
      lastError = new ApiError(
        'Limite de requisições da API atingido (429). Aguarde um pouco ou configure VITE_POKEMONTCG_API_KEY.',
        429,
      )
      continue
    }
    if (res.status >= 500) {
      lastError = new ApiError(`A API de cartas está instável (erro ${res.status}). Tente novamente em instantes.`, res.status)
      continue
    }
    throw new ApiError(`A API de cartas recusou a consulta (erro ${res.status}).`, res.status)
  }
  throw lastError ?? new ApiError('Falha ao acessar a API de cartas.')
}
