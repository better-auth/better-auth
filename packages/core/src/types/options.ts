import type { Logger } from "../env/logger";

// Minimal interface for BetterAuth options to avoid circular dependencies
export interface BetterAuthOptions {
	baseURL?: string;
	appName?: string;
	telemetry?: {
		enabled?: boolean;
		debug?: boolean;
	};
	emailVerification?: any;
	emailAndPassword?: any;
	socialProviders?: Record<string, any>;
	plugins?: Array<{ id: string | symbol }>;
	user?: any;
	verification?: any;
	session?: any;
	account?: any;
	hooks?: any;
	secondaryStorage?: any;
	advanced?: any;
	trustedOrigins?: any;
	rateLimit?: any;
	onAPIError?: any;
	logger?: Logger;
	databaseHooks?: any;
}
