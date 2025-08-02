import { getEnvVar } from "../../utils/env";

export async function detectProduction() {
	return getEnvVar("NODE_ENV") === "production";
}
