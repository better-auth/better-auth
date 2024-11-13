import { createConsola } from "consola";

export type LogLevel = "info" | "success" | "warn" | "error" | "debug";
/**
 * Index of log levels are crucial for determining if a log should be published based on the current log level.
 */
export const levels = ["info", "success", "warn", "error", "debug"] as const;

export function shouldPublishLog(
	currentLogLevel: LogLevel,
	logLevel: LogLevel,
): boolean {
	return levels.indexOf(logLevel) <= levels.indexOf(currentLogLevel);
}

export interface Logger {
	/**
	 * @default true
	 */
	enabled?: boolean;
	/**
	 * default "error"
	 */
	level?: Exclude<LogLevel, "success">;
	log?: (
		level: Exclude<LogLevel, "success">,
		message: string,
		...args: any[]
	) => void;
}

export type LogHandlerParams = Parameters<NonNullable<Logger["log"]>> extends [
	LogLevel,
	...infer Rest,
]
	? Rest
	: never;

const consola = createConsola({
	formatOptions: {
		date: false,
		colors: true,
		compact: true,
	},
	defaults: {
		tag: "Better Auth",
	},
});

/**
 * Creates a logger instance with the specified options.
 */
export const createLogger = (
	options?: Logger,
): Record<LogLevel, (...params: LogHandlerParams) => void> => {
	const enabled = options?.enabled ?? true;
	const logLevel = options?.level ?? "error";

	const LogFunc = (
		level: LogLevel,
		message: string,
		args: any[] = [],
	): void => {
		if (!enabled || !shouldPublishLog(logLevel, level)) {
			return;
		}

		if (!options || typeof options.log !== "function") {
			consola[level]("", message, ...args);
			return;
		}
		options.log(level === "success" ? "info" : level, message, args);
	};

	return Object.fromEntries(
		levels.map((level) => [
			level,
			(...[message, ...args]: LogHandlerParams) =>
				LogFunc(level, message, ...(args || [])),
		]),
	) as Record<LogLevel, (...params: LogHandlerParams) => void>;
};

export const logger = createLogger();
