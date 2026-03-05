import type { DBFieldAttribute } from "@better-auth/core/db";

/**
 * Configuration for an external graph/authorization backend (e.g., SpiceDB/Authzed).
 */
export interface AuthzedConfig {
	/** The gRPC or HTTP endpoint for the Authzed/SpiceDB instance */
	endpoint: string;
	/** Bearer token for authentication */
	token: string;
	/** Optional: path to the .zed schema file */
	schema?: string;
}

export interface GraphOptions {
	/**
	 * Optional Authzed/SpiceDB configuration.
	 * When provided, graph mutations are synced to SpiceDB via the outbox pattern.
	 */
	authzed?: AuthzedConfig;
	/**
	 * Automatically sync graph mutations to the external backend.
	 * @default true
	 */
	autoSync?: boolean;
	/**
	 * Hook into user creation to automatically create graph relationships.
	 * When enabled, uses databaseHooks.user.create.before to write outbox
	 * entries inside the same transaction.
	 */
	userCreationHooks?: {
		enabled: boolean;
		/**
		 * Relationships to create when a new user is created.
		 * Each entry defines a relationship from the new user to an object.
		 */
		relationships?: Array<{
			relation: string;
			objectType: string;
			objectId: string;
		}>;
	};
	schema?: {
		object?: {
			modelName?: string;
			fields?: {
				type?: string;
				externalId?: string;
				externalType?: string;
				attributes?: string;
				metadata?: string;
			};
			additionalFields?: Record<string, DBFieldAttribute>;
		};
		relationship?: {
			modelName?: string;
			fields?: {
				subjectId?: string;
				subjectType?: string;
				objectId?: string;
				objectType?: string;
				relationshipType?: string;
				attributes?: string;
				metadata?: string;
			};
			additionalFields?: Record<string, DBFieldAttribute>;
		};
		schemaDefinition?: {
			modelName?: string;
			fields?: {
				version?: string;
				definition?: string;
				isActive?: string;
				metadata?: string;
				createdBy?: string;
			};
			additionalFields?: Record<string, DBFieldAttribute>;
		};
	};
}
