const TOKEN_KEY = 'crm_token'
const USER_KEY  = 'crm_user'

export interface StoredAuth {
  token: string
  userId: string
  workspaceId: string
  role: string
  firstName: string
  email: string
  workspaceName: string
}

export const auth = {
  save(data: StoredAuth) {
    if (typeof window === 'undefined') return
    localStorage.setItem(TOKEN_KEY, data.token)
    localStorage.setItem(USER_KEY, JSON.stringify(data))
  },

  get(): StoredAuth | null {
    if (typeof window === 'undefined') return null
    const raw = localStorage.getItem(USER_KEY)
    if (!raw) return null
    try {
      return JSON.parse(raw)
    } catch {
      return null
    }
  },

  getToken(): string | null {
    if (typeof window === 'undefined') return null
    return localStorage.getItem(TOKEN_KEY)
  },

  clear() {
    if (typeof window === 'undefined') return
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
  },

  isLoggedIn(): boolean {
    return !!this.getToken()
  },
}