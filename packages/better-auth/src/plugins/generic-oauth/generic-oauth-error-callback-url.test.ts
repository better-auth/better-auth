import { describe, expect, it } from "vitest";
import { parseSetCookieHeader } from "../../cookies";
import { getAuthStateVerificationIdentifier } from "../../state";
import { getTestInstance } from "../../test-utils/test-instance";
import { genericOAuth } from ".";

/**
 * Provider-side OAuth failures (`?error=...` on the callback) must honor the
 * per-flow `errorCallbackURL` persisted with the state, and anything
 * unrecognizable — missing, forged, or consumed state — must fail closed to
 * Better Auth's default error page. An expired state still carries its
 * per-flow target, so it reports `state_mismatch` there instead.
 *
 * @see https://github.com/better-auth/better-auth/issues/11564
 */
describe("generic-oauth provider error callback", () => {
	const providerId = "connection-x";
	const errorCallbackURL = "/settings?failed";
	const defaultErrorURL = "http://localhost:3000/api/auth/error";

	function createInstance(storeStateStrategy?: "cookie") {
		return getTestInstance({
			...(storeStateStrategy ? { account: { storeStateStrategy } } : {}),
			plugins: [
				genericOAuth({
					config: [
						{
							providerId,
							clientId: "test-client-id",
							clientSecret: "test-client-secret",
							authorizationUrl: "https://idp.example.com/authorize",
							tokenUrl: "https://idp.example.com/token",
							userInfoUrl: "https://idp.example.com/userinfo",
						},
					],
				}),
			],
		});
	}

	function callbackURL(query: string) {
		return `http://localhost:3000/api/auth/callback/${providerId}?${query}`;
	}

	/**
	 * Mints a link flow and returns its state, request headers (carrying the
	 * state cookie), and a verification-row lookup scoped to that state via
	 * the adapter `where` idiom. Pass `errorCallbackURL: null` to mint a
	 * flow without a per-flow error target.
	 */
	async function setupLinkFlow(options?: {
		storeStateStrategy?: "cookie";
		errorCallbackURL?: string | null;
	}) {
		const flowErrorCallbackURL =
			options?.errorCallbackURL === undefined
				? errorCallbackURL
				: options.errorCallbackURL;
		const { auth, client, customFetchImpl, cookieSetter, signInWithTestUser } =
			await createInstance(options?.storeStateStrategy);

		const { headers } = await signInWithTestUser();

		const linkRes = await client.linkSocial(
			{
				provider: providerId,
				callbackURL: "/settings?linked",
				...(flowErrorCallbackURL === null
					? {}
					: { errorCallbackURL: flowErrorCallbackURL }),
			},
			{ headers, onSuccess: cookieSetter(headers) },
		);
		if (!linkRes.data?.url) {
			throw new Error("linkSocial did not return an authorization URL");
		}
		const state = new URL(linkRes.data.url).searchParams.get("state") || "";
		expect(state).not.toBe("");

		const ctx = await auth.$context;
		const findStateRecords = () =>
			ctx.adapter.findMany<{ identifier: string; value: string }>({
				model: "verification",
				where: [
					{
						field: "identifier",
						value: getAuthStateVerificationIdentifier(state),
					},
				],
			});
		return { auth, customFetchImpl, headers, state, findStateRecords };
	}

	/**
	 * A provider-side failure (consent denied, `?error=access_denied`) arrives
	 * on the OAuth callback while a valid `state` is in hand. The redirect
	 * must honor the `errorCallbackURL` that was persisted with that state,
	 * not fall back to Better Auth's generic error page; the state must be
	 * consumed and its cookie cleared; and replaying the same callback must
	 * fail closed to the default error page.
	 */
	it("redirects a provider error to the flow's errorCallbackURL and consumes the state", async () => {
		const { customFetchImpl, headers, state, findStateRecords } =
			await setupLinkFlow();

		expect(await findStateRecords()).toHaveLength(1);

		// The user denies consent at the provider, which bounces back with
		// `error=access_denied` and the state we just minted.
		const denied = callbackURL(
			`error=access_denied&state=${encodeURIComponent(state)}`,
		);
		const res = await customFetchImpl(denied, {
			method: "GET",
			headers,
			redirect: "manual",
		});

		expect(res.status).toBe(302);
		const location = res.headers.get("location") ?? "";
		expect(location).toBe(`${errorCallbackURL}&error=access_denied`);

		const setCookie = res.headers.get("set-cookie") ?? "";
		expect(
			parseSetCookieHeader(setCookie).get("better-auth.state")?.["max-age"],
		).toBe(0);

		expect(await findStateRecords()).toHaveLength(0);

		// Replaying the consumed state must fail closed to the default error
		// page — never back to the per-flow URL.
		const replay = await customFetchImpl(denied, {
			method: "GET",
			headers,
			redirect: "manual",
		});
		expect(replay.status).toBe(302);
		const replayLocation = replay.headers.get("location") ?? "";
		expect(replayLocation).toBe(`${defaultErrorURL}?error=state_mismatch`);
		expect(replayLocation).not.toContain(errorCallbackURL);
	});

	/**
	 * Without an `errorCallbackURL` on the flow there is no per-flow target
	 * to honor, so a provider error must fall back to Better Auth's default
	 * error page — and the state must still be consumed.
	 */
	it("falls back to the default error page when the flow has no errorCallbackURL", async () => {
		const { customFetchImpl, headers, state, findStateRecords } =
			await setupLinkFlow({ errorCallbackURL: null });

		expect(await findStateRecords()).toHaveLength(1);

		const res = await customFetchImpl(
			callbackURL(`error=access_denied&state=${encodeURIComponent(state)}`),
			{ method: "GET", headers, redirect: "manual" },
		);

		expect(res.status).toBe(302);
		const location = res.headers.get("location") ?? "";
		expect(location).toBe(`${defaultErrorURL}?error=access_denied`);

		expect(await findStateRecords()).toHaveLength(0);
	});

	/**
	 * The provider's `error_description` must survive onto the per-flow URL
	 * alongside `error`, so the app can render the reason the provider gave.
	 */
	it("forwards the provider error_description to the flow's errorCallbackURL", async () => {
		const { customFetchImpl, headers, state } = await setupLinkFlow();

		const res = await customFetchImpl(
			callbackURL(
				`error=access_denied&error_description=${encodeURIComponent("consent_required")}&state=${encodeURIComponent(state)}`,
			),
			{ method: "GET", headers, redirect: "manual" },
		);

		expect(res.status).toBe(302);
		const location = res.headers.get("location") ?? "";
		expect(location).toBe(
			`${errorCallbackURL}&error=access_denied&error_description=consent_required`,
		);
	});

	/**
	 * With no usable state there is nothing to recover a per-flow target
	 * from, so the callback must fail closed to the default error page —
	 * whether `state` is absent or empty.
	 */
	it("falls back to the default error page when the callback carries no state", async () => {
		const { customFetchImpl } = await createInstance();

		for (const query of ["error=access_denied", "error=access_denied&state="]) {
			const res = await customFetchImpl(callbackURL(query), {
				method: "GET",
				redirect: "manual",
			});

			expect(res.status).toBe(302);
			const location = res.headers.get("location") ?? "";
			expect(location).toBe(`${defaultErrorURL}?error=state_not_found`);
		}
	});

	/**
	 * A forged or unknown state must fail closed to the default error page
	 * with `state_mismatch` — the attacker-supplied `error` must not
	 * launder a redirect to any per-flow URL.
	 */
	it("fails closed to the default error page for an unknown state", async () => {
		const { customFetchImpl } = await createInstance();

		const res = await customFetchImpl(
			callbackURL(
				`error=access_denied&state=${encodeURIComponent("forged-state")}`,
			),
			{ method: "GET", redirect: "manual" },
		);

		expect(res.status).toBe(302);
		const location = res.headers.get("location") ?? "";
		expect(location).toBe(`${defaultErrorURL}?error=state_mismatch`);
		expect(location).not.toContain(errorCallbackURL);
	});

	/**
	 * Cookie-strategy flows persist no verification row; the provider error
	 * must still honor the per-flow URL and expire the state cookie.
	 */
	it("honors the flow's errorCallbackURL under the cookie state strategy", async () => {
		const { customFetchImpl, headers, state } = await setupLinkFlow({
			storeStateStrategy: "cookie",
		});

		const res = await customFetchImpl(
			callbackURL(`error=access_denied&state=${encodeURIComponent(state)}`),
			{ method: "GET", headers, redirect: "manual" },
		);

		expect(res.status).toBe(302);
		const location = res.headers.get("location") ?? "";
		expect(location).toBe(`${errorCallbackURL}&error=access_denied`);

		const setCookie = res.headers.get("set-cookie") ?? "";
		expect(
			parseSetCookieHeader(setCookie).get("better-auth.oauth_state")?.[
				"max-age"
			],
		).toBe(0);
	});

	/**
	 * An expired state still carries its per-flow target, so the redirect
	 * reports `state_mismatch` there instead of the default error page.
	 */
	it("reports an expired state to the flow's errorCallbackURL", async () => {
		const { auth, customFetchImpl, headers, state, findStateRecords } =
			await setupLinkFlow();

		const records = await findStateRecords();
		expect(records).toHaveLength(1);
		const payload = JSON.parse(records[0]!.value) as { expiresAt: number };
		const ctx = await auth.$context;
		await ctx.adapter.update({
			model: "verification",
			where: [
				{
					field: "identifier",
					value: getAuthStateVerificationIdentifier(state),
				},
			],
			update: {
				value: JSON.stringify({ ...payload, expiresAt: Date.now() - 1000 }),
			},
		});

		const res = await customFetchImpl(
			callbackURL(`error=access_denied&state=${encodeURIComponent(state)}`),
			{ method: "GET", headers, redirect: "manual" },
		);

		expect(res.status).toBe(302);
		const location = res.headers.get("location") ?? "";
		expect(location).toBe(`${errorCallbackURL}&error=state_mismatch`);
	});
});
