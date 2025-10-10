import { getColorDepth } from "./color-depth";

export const TTY_COLORS = {
	reset: "\x1b[0m",
	bright: "\x1b[1m",
	dim: "\x1b[2m",
	undim: "\x1b[22m",
	underscore: "\x1b[4m",
	blink: "\x1b[5m",
	reverse: "\x1b[7m",
	hidden: "\x1b[8m",
	fg: {
		black: "\x1b[30m",
		red: "\x1b[31m",
		green: "\x1b[32m",
		yellow: "\x1b[33m",
		blue: "\x1b[34m",
		magenta: "\x1b[35m",
		cyan: "\x1b[36m",
		white: "\x1b[37m",
	},
	bg: {
		black: "\x1b[40m",
		red: "\x1b[41m",
		green: "\x1b[42m",
		yellow: "\x1b[43m",
		blue: "\x1b[44m",
		magenta: "\x1b[45m",
		cyan: "\x1b[46m",
		white: "\x1b[47m",
	},
} as const;

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
	info: TTY_COLORS.fg.blue,
	success: TTY_COLORS.fg.green,
	warn: TTY_COLORS.fg.yellow,
	error: TTY_COLORS.fg.red,
	debug: TTY_COLORS.fg.magenta,
};

const formatMessage = (
	level: LogLevel,
	message: string,
	colorsEnabled: boolean,
): string => {
	const timestamp = new Date().toISOString();

	if (colorsEnabled) {
		return `${TTY_COLORS.dim}${timestamp}${TTY_COLORS.reset} ${
			levelColors[level]
		}${level.toUpperCase()}${TTY_COLORS.reset} ${TTY_COLORS.bright}[Better Auth]:${
			TTY_COLORS.reset
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
