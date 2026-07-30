// Access token vive solo en memoria (nunca en localStorage/cookie)
let _accessToken: string | null = null

export const tokenStore = {
  get: () => _accessToken,
  set: (token: string) => { _accessToken = token },
  clear: () => { _accessToken = null },
}
