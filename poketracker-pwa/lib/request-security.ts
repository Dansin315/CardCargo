import 'server-only'

export function hasTrustedRequestOrigin(request: Request) {
  const origin = request.headers.get('origin')
  const fetchSite = request.headers.get('sec-fetch-site')

  if (!origin) return fetchSite === 'same-origin'

  try {
    const sameOrigin = new URL(origin).origin === new URL(request.url).origin
    return sameOrigin && (!fetchSite || fetchSite === 'same-origin')
  } catch {
    return false
  }
}
