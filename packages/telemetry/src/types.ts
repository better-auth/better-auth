export interface DetectionInfo {
	name: string;
	version: string | null;
}

export interface SystemInfo {
	// Software information
	systemPlatform: string;
	systemRelease: string;
	systemArchitecture: string;

	// Machine information
	cpuCount: number;
	cpuModel: string | null;
	cpuSpeed: number | null;
	memory: number;

	// Environment information
	isDocker: boolean;
	isTTY: boolean;
	isWSL: boolean;
	isCI: boolean;
}

export interface AuthConfigInfo {
	options: any;
	plugins: string[];
}

export interface ProjectInfo {
	isGit: boolean;
	packageManager: DetectionInfo | null;
}

export interface TelemetryEvent {
	type: string;
	anonymousId?: string;
	payload: Record<string, any>;
}

export interface TelemetryContext {
	customTrack?: (event: TelemetryEvent) => Promise<void>;
	database?: string;
	adapter?: string;
	skipTestCheck?: boolean;
}

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
	logger?: any;
	databaseHooks?: any;
}
