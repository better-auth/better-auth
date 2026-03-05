export interface DetectionInfo {
	name: string;
	version: string | null;
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
