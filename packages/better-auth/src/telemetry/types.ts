export type DatabaseType =
	| "prisma"
	| "drizzle"
	| "kysely"
	| "mongoose"
	| "postgres"
	| "mysql"
	| "sqlite"
	| "unknown";

export type AdapterType =
	| "prisma"
	| "drizzle"
	| "kysely"
	| "mongoose"
	| "postgres"
	| "mysql"
	| "sqlite"
	| "custom"
	| "unknown";

export interface DeviceState {
	anonymousId: string;
	isProduction: boolean;
	plugins: string[];
	lastUpdated: number;
	version: string;
	betterAuthVersion: string;
	nodeVersion?: string;
	runtime?: string;
	framework?: string;
	database?: DatabaseType;
	adapter?: AdapterType;
	authConfig?: string;
}

export interface TelemetryEvent {
	event: "auth_";
	anonymousId: string;
	isProduction: boolean;
	plugins: string[];
	lastUpdated: number;
	version: string;
	betterAuthVersion: string;
	nodeVersion?: string;
	runtime?: string;
	framework?: string;
	database?: DatabaseType;
	adapter?: AdapterType;
	authConfig?: string;
}

export interface TelemetryOptions {
	enabled?: boolean;
	endpoint?: string;
}

export interface DetectionInfo {
	name: string;
	version?: string;
}
