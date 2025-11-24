import type { DBFieldAttribute } from "@better-auth/core/db";

export interface AssetOptions {
	/**
	 * Default asset types to create when plugin is initialized
	 */
	defaultAssetTypes?: {
		name: string;
		description: string;
		scope?: "organization" | "global";
		source?: string; // App identifier
		defaultVisibility?: "private" | "internal" | "public";
		allowedVisibilities?: ("private" | "internal" | "public")[];
		builtInRoles?: {
			type: string;
			name: string;
			description: string;
			permissions?: Record<string, any>;
		}[];
	}[];

	/**
	 * Schema customization
	 */
	schema?: {
		assetType?: {
			modelName?: string;
			fields?: { [key: string]: string };
			additionalFields?: { [key: string]: DBFieldAttribute };
		};
		asset?: {
			modelName?: string;
			fields?: { [key: string]: string };
			additionalFields?: { [key: string]: DBFieldAttribute };
		};
		assetRole?: {
			modelName?: string;
			fields?: { [key: string]: string };
			additionalFields?: { [key: string]: DBFieldAttribute };
		};
		memberAssetRole?: {
			modelName?: string;
			fields?: { [key: string]: string };
			additionalFields?: { [key: string]: DBFieldAttribute };
		};
		assetShare?: {
			modelName?: string;
			fields?: { [key: string]: string };
			additionalFields?: { [key: string]: DBFieldAttribute };
		};
		assetShareLink?: {
			modelName?: string;
			fields?: { [key: string]: string };
			additionalFields?: { [key: string]: DBFieldAttribute };
		};
	};
}
