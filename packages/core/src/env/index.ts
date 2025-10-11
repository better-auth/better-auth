export {
	ENV,
	getEnvVar,
	env,
	nodeENV,
	isTest,
	getBooleanEnvVar,
	isDevelopment,
	type EnvObject,
	isProduction,
} from "./env-impl.js";
export { getColorDepth } from "./color-depth.js";
export {
	logger,
	createLogger,
	levels,
	type Logger,
	type LogLevel,
	type LogHandlerParams,
	type InternalLogger,
	shouldPublishLog,
	TTY_COLORS,
} from "./logger.js";
