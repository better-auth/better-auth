import { v1 } from "@authzed/authzed-node"

export interface AuthzedConfig {
  token: string
  endpoint?: string
}

export class AuthzedSyncClient {
  private client: v1.ZedClientInterface
  private enabled: boolean

  constructor(config?: AuthzedConfig) {
    this.enabled = true
    this.client = v1.NewClient(
      "secret",
      "localhost:50052",
      v1.ClientSecurity.INSECURE_LOCALHOST_ALLOWED,
      undefined,
      {}
    )
  }

  /**
   * Convert internal object ID to Authzed resource reference
   */
  private objectToResource(
    objectId: string,
    objectType: string
  ): v1.ObjectReference {
    return v1.ObjectReference.create({
      objectType: objectType,
      objectId: objectId,
    })
  }

  /**
   * Convert internal subject to Authzed subject reference
   */
  private subjectToReference(
    subjectId: string,
    subjectType: string,
    optionalRelation?: string
  ): v1.SubjectReference {
    return v1.SubjectReference.create({
      object: v1.ObjectReference.create({
        objectType: subjectType,
        objectId: subjectId,
      }),
      optionalRelation: optionalRelation,
    })
  }

  /**
   * Sync an object creation to Authzed
   */
  async syncObject(
    objectId: string,
    objectType: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    if (!this.enabled) return
    let objectRef = v1.ObjectReference.create({
      objectType: objectType,
      objectId: objectId,
    })

    // Objects in Authzed are created implicitly when relationships are written
    // We don't need to explicitly create them
  }

  /**
   * Sync a relationship creation to Authzed
   */
  async syncRelationship(
    subjectId: string,
    subjectType: string,
    objectId: string,
    objectType: string,
    relationshipType: string,
    optionalRelation?: string,
    metadata?: Record<string, unknown>
  ) {
    if (!this.enabled) return null

    const request: v1.WriteRelationshipsRequest =
      v1.WriteRelationshipsRequest.create({
        updates: [
          v1.RelationshipUpdate.create({
            relationship: v1.Relationship.create({
              resource: this.objectToResource(objectId, objectType),
              relation: relationshipType,
              subject: this.subjectToReference(
                subjectId,
                subjectType,
                optionalRelation
              ),
            }),
            operation: v1.RelationshipUpdate_Operation.CREATE,
          }),
        ],
      })

    return await this.client.promises.writeRelationships(request)
  }

  /**
   * Sync a relationship deletion to Authzed
   */
  async syncRelationshipDelete(
    subjectId: string,
    subjectType: string,
    objectId: string,
    objectType: string,
    relationshipType: string
  ): Promise<ZedToken | null> {
    if (!this.enabled) return null

    const relationship: Relationship = {
      resource: this.objectToResource(objectId, objectType),
      relation: relationshipType,
      subject: this.subjectToReference(subjectId, subjectType),
    }

    const request: DeleteRelationshipsRequest = {
      relationshipFilter: {
        resourceType: objectType,
        optionalResourceId: objectId,
        optionalRelation: relationshipType,
        optionalSubjectFilter: {
          subjectType: subjectType,
          optionalSubjectId: subjectId,
        },
      },
    }

    const response = await this.client.deleteRelationships(request)
    return response.deletedAt || null
  }

  /**
   * Check permission in Authzed
   */
  async checkPermission(
    actorId: string,
    actorType: string,
    targetId: string,
    targetType: string,
    permission: string
  ): Promise<{ allowed: boolean; checkedAt?: ZedToken }> {
    if (!this.enabled) {
      return { allowed: false }
    }

    const request: CheckPermissionRequest = {
      resource: this.objectToResource(targetId, targetType),
      permission,
      subject: this.subjectToReference(actorId, actorType),
    }

    const response = await this.client.checkPermission(request)
    return {
      allowed: response.permissionship === "PERMISSIONSHIP_HAS_PERMISSION",
      checkedAt: response.checkedAt || undefined,
    }
  }

  /**
   * Batch sync multiple relationships
   */
  async syncRelationshipsBatch(
    relationships: Array<{
      subjectId: string
      subjectType: string
      objectId: string
      objectType: string
      relationshipType: string
      operation: "create" | "delete" | "touch"
      optionalRelation?: string
    }>
  ) {
    if (!this.enabled) return null

    const request: v1.WriteRelationshipsRequest =
      v1.WriteRelationshipsRequest.create({
        updates: relationships.map((rel) =>
          v1.RelationshipUpdate.create({
            relationship: v1.Relationship.create({
              resource: this.objectToResource(rel.objectId, rel.objectType),
              relation: rel.relationshipType,
              subject: this.subjectToReference(
                rel.subjectId,
                rel.subjectType,
                rel.optionalRelation
              ),
            }),
            operation:
              rel.operation === "create"
                ? v1.RelationshipUpdate_Operation.CREATE
                : rel.operation === "touch"
                  ? v1.RelationshipUpdate_Operation.TOUCH
                  : v1.RelationshipUpdate_Operation.DELETE,
          })
        ),
      })

    return await this.client.promises.writeRelationships(request)
  }

  /**
   * Read Authzed schema
   */
  async readSchema(): Promise<v1.ReadSchemaResponse | undefined> {
    if (!this.enabled) return undefined

    const request: v1.ReadSchemaRequest = {}
    const promise = new Promise<v1.ReadSchemaResponse | undefined>(
      (resolve, reject) => {
        this.client.readSchema(request, (err, value) => {
          if (err) {
            console.error(err)
            reject(err)
          } else {
            resolve(value)
          }
        })
      }
    )
    return await promise
  }

  /**
   * Write Authzed schema
   */
  async writeSchema(
    schemaText: string
  ): Promise<v1.WriteRelationshipsResponse | undefined> {
    if (!this.enabled) return undefined

    const request: v1.WriteSchemaRequest = {
      schema: schemaText,
    }

    const response = new Promise<v1.WriteRelationshipsResponse | undefined>(
      (resolve, reject) => {
        this.client.writeSchema(request, (err, value) => {
          if (err) {
            console.error(err)
            reject(err)
          } else {
            resolve(value)
          }
        })
      }
    )
    return response
  }
}
