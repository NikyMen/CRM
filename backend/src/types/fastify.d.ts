import '@fastify/jwt'

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      sub: string
      userId: string 
      workspaceId: string
      role: string
      type: string
    }
    user: {
      sub: string
      userId: string 
      workspaceId: string
      userId: string
      role: string
    }
  }
}