import winston from "winston";

export interface BetterAuthLoggerOptions
	extends Pick<winston.LoggerOptions, "level" | "transports"> {
	/**
	 * Disable logging
	 *
	 * @default false
	 */
	disabled?: boolean;
}

export const createLogger = (options?: BetterAuthLoggerOptions) => {
	return winston.createLogger({
		defaultMeta: {
			tag: "Better Auth",
		},
		silent: options?.disabled || false,
		transports: [
			new winston.transports.Console({
				format: winston.format.combine(
					winston.format.colorize(),
					winston.format.simple(),
				),
			}),
			...(options?.transports !== undefined
				? Array.isArray(options.transports)
					? options.transports
					: [options.transports]
				: []),
		],
	});
};

export const logger = createLogger();
