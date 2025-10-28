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
	anonymousId?: string | undefined;
	payload: Record<string, any>;
}

export interface TelemetryContext {
	customTrack?: ((event: TelemetryEvent) => Promise<void>) | undefined;
	database?: string | undefined;
	adapter?: string | undefined;
	skipTestCheck?: boolean | undefined;
}
