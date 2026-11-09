import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { slack } from "./slack";

const endpoint = "https://slack.com/api/openid.connect.userInfo";
const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

/**
 * @see https://docs.slack.dev/reference/methods/openid.connect.userInfo/
 */
describe("Slack userinfo responses", () => {
	it("rejects HTTP 200 platform errors", async () => {
		server.use(
			http.all(endpoint, () =>
				HttpResponse.json({ ok: false, error: "invalid_auth" }),
			),
		);
		expect(
			await slack({ clientId: "app", clientSecret: "secret" }).getUserInfo!({
				accessToken: "token",
			}),
		).toBeNull();
	});

	it("posts userinfo and preserves scope-limited profiles", async () => {
		server.use(
			http.all(endpoint, ({ request }) => {
				expect(request.method).toBe("POST");
				expect(request.headers.get("authorization")).toBe("Bearer token");
				return HttpResponse.json({
					ok: true,
					sub: "U123",
					"https://slack.com/user_id": "U123",
					"https://slack.com/team_id": "T123",
				});
			}),
		);
		expect(
			await slack({ clientId: "app", clientSecret: "secret" }).getUserInfo!({
				accessToken: "token",
			}),
		).toMatchObject({ sub: "U123", emailVerified: false });
	});
});
