export { getColorDepth } from "./color-depth";
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
} from "./env-impl";
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
} from "./logger";
