export interface DetectionInfo {
	name: string;
	version?: string;
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
	ciName: string | null;
}

export interface AuthConfigInfo {
	options: any;
	plugins: string[];
}
