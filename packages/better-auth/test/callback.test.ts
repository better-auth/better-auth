import { describe, expect } from "vitest";
import { generateState, getState } from "../src/oauth2/signin";

describe("callback handler", async (it) => {
	it("state generation", async () => {
		const state = getState(generateState("/"));
		expect(state).toMatchObject({
			hash: expect.any(String),
			currentURL: "/",
			callbackURL: "/",
		});
		const state2 = getState(
			generateState("/", "/callback", { test: "test" }, true, false),
		);

		expect(state2).toMatchObject({
			hash: expect.any(String),
			currentURL: "/",
			callbackURL: "/callback",
			signUp: {
				data: {
					test: "test",
				},
				autoCreateSession: true,
				onlySignUp: false,
			},
		});
	});
});
