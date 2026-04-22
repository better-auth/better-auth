export { getColorDepth } from "./color-depth.js";
export {
	ENV,
	type EnvObject,
	env,
	getBooleanEnvVar,
	getEnvVar,
	isDevelopment,
	isProduction,
	isTest,
	nodeENV,
} from "./env-impl.js";
export {
	createLogger,
	type InternalLogger,
	type Logger,
	type LogHandlerParams,
	type LogLevel,
	levels,
	logger,
	shouldPublishLog,
	TTY_COLORS,
} from "./logger.js";
