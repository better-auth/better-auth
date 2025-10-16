export type LogLevel = "info" | "success" | "warn" | "error" | "debug";

export type LogHandlerParams = Parameters<NonNullable<Logger["log"]>> extends [
	LogLevel,
	...infer Rest,
]
	? Rest
	: never;

export interface Logger {
	disabled?: boolean;
	disableColors?: boolean;
	level?: Exclude<LogLevel, "success">;
	log?: (
		level: Exclude<LogLevel, "success">,
		message: string,
		...args: any[]
	) => void;
}
