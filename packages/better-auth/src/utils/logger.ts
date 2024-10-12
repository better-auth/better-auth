type LogLevel = "debug" | "info" | "success" | "warn" | "error";
type LogFunction = (message: any, ...args: any[]) => void;
type LoggerOptions = {
	disabled?: boolean;
	minLevel?: LogLevel;
	customFormat?: (
		level: LogLevel,
		message: any,
		timestamp: string,
		libraryName: string,
		...args: any[]
	) => string;
};

const LOG_LEVELS: Record<LogLevel, number> = {
	debug: 0,
	info: 1,
	success: 2,
	warn: 3,
	error: 4,
};

const LIBRARY_NAME = "Better Auth";

const formatDate = (date: Date): string => {
	const pad = (num: number): string => num.toString().padStart(2, "0");

	const year = date.getFullYear();
	const month = pad(date.getMonth() + 1);
	const day = pad(date.getDate());
	const hours = pad(date.getHours());
	const minutes = pad(date.getMinutes());
	const seconds = pad(date.getSeconds());

	return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

const colorize = (text: string, color: string): string => {
	const colors: Record<string, string> = {
		reset: "\x1b[0m",
		green: "\x1b[32m",
		yellow: "\x1b[33m",
		red: "\x1b[31m",
		blue: "\x1b[34m",
		cyan: "\x1b[36m",
	};
	return `${colors[color]}${text}${colors.reset}`;
};

const defaultFormat = (
	level: LogLevel,
	message: any,
	timestamp: string,
	libraryName: string,
	...args: any[]
): string => {
	let formattedLevel = level.toUpperCase();
	let colorizedMessage = message;

	switch (level) {
		case "debug":
			formattedLevel = colorize(formattedLevel, "cyan");
			break;
		case "info":
			formattedLevel = colorize(formattedLevel, "blue");
			break;
		case "success":
			formattedLevel = colorize(`✓ ${formattedLevel}`, "green");
			colorizedMessage = colorize(message, "green");
			break;
		case "warn":
			formattedLevel = colorize(formattedLevel, "yellow");
			break;
		case "error":
			formattedLevel = colorize(formattedLevel, "red");
			break;
	}

	return `[${timestamp}] [${libraryName}] ${formattedLevel}: ${colorizedMessage} ${
		args.length ? JSON.stringify(args) : ""
	}`;
};

export function createLogger(options: LoggerOptions = {}) {
	const {
		disabled = false,
		minLevel = "info",
		customFormat = defaultFormat,
	} = options;

	const loggerFunction = (level: LogLevel): LogFunction => {
		return (message: any, ...args: any[]) => {
			if (disabled) return;
			if (LOG_LEVELS[level] >= LOG_LEVELS[minLevel]) {
				const timestamp = formatDate(new Date());
				const formattedMessage = customFormat(
					level,
					message,
					timestamp,
					LIBRARY_NAME,
					...args,
				);
				console.log(formattedMessage);
			}
		};
	};

	return {
		debug: loggerFunction("debug"),
		info: loggerFunction("info"),
		break: () => {
			console.log("\n");
		},
		success: loggerFunction("success"),
		warn: loggerFunction("warn"),
		error: loggerFunction("error"),
		setMinLevel: (level: LogLevel) => {
			options.minLevel = level;
		},
	};
}

export const logger = createLogger();
