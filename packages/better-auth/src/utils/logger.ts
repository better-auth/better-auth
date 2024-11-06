import pino, { type LoggerOptions as PinoLoggerOptions } from "pino";
import pretty from "pino-pretty";

export interface LoggerOptions {
	enabled?: boolean;
	level?: PinoLoggerOptions["level"];
	// base?: Record<string, any>
}

export const createLogger = (options?: LoggerOptions) => {
	const logger = pino(
		{
			enabled: options?.enabled,
			level: options?.level || "info",
			base: undefined,
		},
		pretty({
			colorize: true,
			translateTime: "yyyy-mm-dd HH:MM:ss",
			messageFormat: (log, messageKey) => {
				const tag = log.tag ? `[${log.tag}] ` : "";
				const message = log[messageKey] || "";
				return `${tag}${message}`;
			},
		}),
	);

	return logger;
};

export const logger = createLogger();
