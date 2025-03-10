import { generateSecretHash } from "../../secret";
import type { Step } from "../types";

export const checkEnv: Step<[]> = {
	id: "check-env",
	description: "Checking if the required ENVs are set",
	exec: async (helpers, options) => {
		return {
			result: {
				data: null,
				error: null,
				message: null,
				state: "success",
			},
			envs: [
                {
                    name: "BETTER_AUTH_SECRET",
                    value: generateSecretHash(),
                },
                {
                    name: "BETTER_AUTH_URL",
                    value: "http://localhost:3000",
                    comment: "Your APP URL"
                }
            ],
			shouldContinue: true,
		};
	},
};
