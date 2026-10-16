import { slack as builtinSlack } from "@better-auth/core/social-providers";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import {
	afterAll,
	afterEach,
	beforeAll,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import { slack as genericSlack } from "../plugins/generic-oauth/providers/slack";

const endpoint = "https://slack.com/api/openid.connect.userInfo";
const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

/** @see https://docs.slack.dev/reference/methods/openid.connect.userInfo/ */
describe("Slack userinfo responses", () => {
	it("rejects HTTP 200 platform errors in both providers", async () => {
		server.use(
			http.all(endpoint, () =>
				HttpResponse.json({ ok: false, error: "invalid_auth" }),
			),
		);
		const mapProfileToUser = vi.fn(() => ({}));
		expect(
			await builtinSlack({ clientId: "app", mapProfileToUser }).getUserInfo({
				accessToken: "token",
			}),
		).toBeNull();
		expect(
			await genericSlack({ clientId: "app", clientSecret: "secret" })
				.getUserInfo!({ accessToken: "token" }),
		).toBeNull();
		expect(mapProfileToUser).not.toHaveBeenCalled();
	});

	it("posts userinfo and preserves scope-limited profiles", async () => {
		const profile = {
			ok: true,
			sub: "U123",
			"https://slack.com/user_id": "U123",
			"https://slack.com/team_id": "T123",
		};
		server.use(
			http.all(endpoint, ({ request }) => {
				expect(request.method).toBe("POST");
				expect(request.headers.get("authorization")).toBe("Bearer token");
				return HttpResponse.json(profile);
			}),
		);
		expect(
			(
				await builtinSlack({ clientId: "app" }).getUserInfo({
					accessToken: "token",
				})
			)?.data,
		).toEqual(profile);
		expect(
			await genericSlack({ clientId: "app", clientSecret: "secret" })
				.getUserInfo!({ accessToken: "token" }),
		).toMatchObject({ sub: "U123", emailVerified: false });
	});
});
