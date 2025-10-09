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
} from "./env-impl";
export { getColorDepth } from "./color-depth";

export {
	TTY_COLORS,
	type InternalLogger,
	globalLog,
	createLogger,
	shouldPublishLog,
} from "./logger";
