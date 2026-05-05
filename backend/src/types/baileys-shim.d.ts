declare module 'baileys' {
  export const DisconnectReason: {
    loggedOut: number
    connectionClosed: number
    connectionLost: number
    timedOut: number
    restartRequired: number
  }

  export function makeWASocket(config: any): any

  export function useMultiFileAuthState(folder: string): Promise<{
    state: any
    saveCreds: () => Promise<void>
  }>

  const defaultExport: typeof makeWASocket
  export default defaultExport
}
