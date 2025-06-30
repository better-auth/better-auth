import { describe, it, expect } from "vitest";
import { botId } from "./index";
import { betterAuth } from "better-auth";
import { createAuthClient } from "better-auth/client";

const auth = betterAuth({
	emailAndPassword: {
		enabled: true,
	},
	plugins: [
		botId({
			async validateRequest({ request, verification }) {
				return !verification.isBot;
			},
			checkBotIdOptions: { developmentOptions: { bypass: "BAD-BOT" } },
		}),
	],
});

const customFetchImpl = async (
	url: string | URL | Request,
	init?: RequestInit,
) => {
	return auth.handler(new Request(url, init));
};

const authClient = createAuthClient({
	baseURL: "http://localhost:3000/api/auth",
	fetchOptions: {
		customFetchImpl,
	},
});

describe("botid", () => {
	it("should have expected error details when request is a bot", async () => {
		const response = await authClient.signUp.email({
			name: "John Doe",
			email: "john.doe@example.com",
			password: "password",
		});

		expect(response.data).toBeNull();
		expect(response.error?.message).toBe("Bot detected");
		expect(response.error?.code).toBe("BOT_DETECTED");
		expect(response.error?.statusText).toBe("FORBIDDEN");
	});
});
