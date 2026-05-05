const TOKEN_KEY = 'crm_token'
const USER_KEY  = 'crm_user'

export interface StoredAuth {
  token: string
  userId: string
  workspaceId: string
  role: string
  firstName: string
  lastName?: string | null
  email: string
  workspaceName: string
  avatar?: string | null
}

export const auth = {
  save(data: StoredAuth) {
    if (typeof window === 'undefined') return
    localStorage.setItem(TOKEN_KEY, data.token)
    localStorage.setItem(USER_KEY, JSON.stringify(data))
    window.dispatchEvent(new Event('crm_user_updated'))
  },

  updateUser(data: Partial<Omit<StoredAuth, 'token'>>) {
    if (typeof window === 'undefined') return
    const current = this.get()
    if (!current) return
    localStorage.setItem(USER_KEY, JSON.stringify({ ...current, ...data }))
    window.dispatchEvent(new Event('crm_user_updated'))
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
