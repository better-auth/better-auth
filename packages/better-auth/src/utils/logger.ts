import { getColorDepth } from "./color-depth";
import { colors } from "./colors";

export type LogLevel = "info" | "success" | "warn" | "error" | "debug";

export const levels = ["info", "success", "warn", "error", "debug"] as const;

export function shouldPublishLog(
	currentLogLevel: LogLevel,
	logLevel: LogLevel,
): boolean {
	return levels.indexOf(logLevel) <= levels.indexOf(currentLogLevel);
}

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

export type LogHandlerParams = Parameters<NonNullable<Logger["log"]>> extends [
	LogLevel,
	...infer Rest,
]
	? Rest
	: never;

const levelColors: Record<LogLevel, string> = {
	info: colors.fg.blue,
	success: colors.fg.green,
	warn: colors.fg.yellow,
	error: colors.fg.red,
	debug: colors.fg.magenta,
};

const formatMessage = (
	level: LogLevel,
	message: string,
	colorsEnabled: boolean,
): string => {
	const timestamp = new Date().toISOString();

	if (colorsEnabled) {
		return `${colors.dim}${timestamp}${colors.reset} ${
			levelColors[level]
		}${level.toUpperCase()}${colors.reset} ${colors.bright}[Better Auth]:${
			colors.reset
		} ${message}`;
	}

	return `${timestamp} ${level.toUpperCase()} [Better Auth]: ${message}`;
};

export type InternalLogger = {
	[K in LogLevel]: (...params: LogHandlerParams) => void;
} & {
	get level(): LogLevel;
};

export const createLogger = (options?: Logger): InternalLogger => {
	const enabled = options?.disabled !== true;
	const logLevel = options?.level ?? "error";

	const isDisableColorsSpecified = options?.disableColors !== undefined;
	const colorsEnabled = isDisableColorsSpecified
		? !options.disableColors
		: getColorDepth() !== 1;

	const LogFunc = (
		level: LogLevel,
		message: string,
		args: any[] = [],
	): void => {
		if (!enabled || !shouldPublishLog(logLevel, level)) {
			return;
		}

		const formattedMessage = formatMessage(level, message, colorsEnabled);

		if (!options || typeof options.log !== "function") {
			if (level === "error") {
				console.error(formattedMessage, ...args);
			} else if (level === "warn") {
				console.warn(formattedMessage, ...args);
			} else {
				console.log(formattedMessage, ...args);
			}
			return;
		}

		options.log(level === "success" ? "info" : level, message, ...args);
	};

	const logger = Object.fromEntries(
		levels.map((level) => [
			level,
			(...[message, ...args]: LogHandlerParams) =>
				LogFunc(level, message, args),
		]),
	) as Record<LogLevel, (...params: LogHandlerParams) => void>;

	return {
		...logger,
		get level() {
			return logLevel;
		},
	};
};

export const logger = createLogger();
