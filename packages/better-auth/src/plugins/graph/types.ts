import type { DBFieldAttribute } from "@better-auth/core/db";

import type { AuthzedConfig } from "./authzed-client";

export interface GraphOptions {
	authzed?: AuthzedConfig;
	autoSync?: boolean;
	schema?: {
		object?: {
			modelName?: string;
			fields?: {
				type?: string;
				externalId?: string;
				externalType?: string;
				attributes?: string;
				metadata?: string;
				createdAt?: string;
				updatedAt?: string;
			};
			additionalFields?: {
				[key in string]: DBFieldAttribute;
			};
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
			additionalFields?: {
				[key in string]: DBFieldAttribute;
			};
		};
		schemaDefinition?: {
			modelName?: string;
			fields?: {
				version?: string;
				definition?: string;
				isActive?: string;
				metadata?: string;
				createdBy?: string;
				createdAt?: string;
				updatedAt?: string;
			};
			additionalFields?: {
				[key in string]: DBFieldAttribute;
			};
		};
	};
}
