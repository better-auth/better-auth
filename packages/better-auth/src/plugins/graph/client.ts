import type { BetterAuthClientPlugin } from "better-auth/client"

export interface GraphClient {
  getOrCreateObject: (params: {
    type: string
    externalId?: string
    externalType?: string
    attributes?: Record<string, unknown>
  }) => Promise<{ objectId: string; success: boolean }>

  getObject: (params: {
    id?: string
    externalId?: string
    externalType?: string
  }) => Promise<{ object: any }>

  createRelationship: (params: {
    subjectId: string
    objectId: string
    relationshipType: string
    attributes?: Record<string, unknown>
  }) => Promise<{ relationshipId: string; success: boolean }>

  deleteRelationship: (params: {
    relationshipId: string
  }) => Promise<{ success: boolean }>

  getRelationships: (params: {
    objectId: string
    direction?: "incoming" | "outgoing" | "both"
    relationshipType?: string
  }) => Promise<{ relationships: any[] }>

  registerObjectType: (params: {
    name: string
    description?: string
    externalType?: string
    metadata?: Record<string, unknown>
  }) => Promise<{ typeId: string; success: boolean }>

  registerRelationshipType: (params: {
    name: string
    description?: string
    isTransitive?: boolean
    inverseType?: string
    externalRelation?: string
    metadata?: Record<string, unknown>
  }) => Promise<{ typeId: string; success: boolean }>

  findPath: (params: {
    subjectId: string
    objectId: string
    maxDepth?: number
    relationshipTypes?: string
  }) => Promise<{ paths: any[] }>
}

export function graphClient(): BetterAuthClientPlugin {
  return {
    id: "graph",
    $InferServerPlugin: {} as any,
  }
}

export default graphClient
