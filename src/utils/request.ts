interface Options {
  base: string
  path: string
  method?: string
  query?: Record<string, any>
  headers?: Record<string, string>,
  body?: Record<string, any>
}

export default async function request <T = any>(options: Options) {
  const headers: Record<string, any> = {
    "Content-Type": "application/json",
    ...options.headers
  }

  let requestParams: string = ""

  if (options.query) {
    const paramsConstructor = new URLSearchParams()

    Object.entries(options.query).map(([ key, value ]) => {
      if (value !== null && value !== undefined) paramsConstructor.set(key, String(value))
    })

    requestParams = `?${ paramsConstructor.toString() }`
  }

  const response = await fetch(options.base + options.path + requestParams, {
    method: options.method ?? "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  }).catch(() => null)

  if (!response || !response.ok) return null

  return response.json().catch(() => null) as null | T
}