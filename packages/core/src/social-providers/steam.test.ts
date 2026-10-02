import { afterEach, describe, expect, it, vi } from "vitest";
import { steam } from "./steam";

const steamId = "76561198000000000";
const redirectURI = "https://app.example/api/auth/callback/steam";
const state = "test-state";
const endpoint = "https://steamcommunity.com/openid/login";
const namespace = "http://specs.openid.net/auth/2.0";

function assertion() {
	const returnTo = `${redirectURI}?state=${state}`;
	const params = new URLSearchParams({
		state,
		"openid.ns": namespace,
		"openid.mode": "id_res",
		"openid.op_endpoint": endpoint,
		"openid.claimed_id": `https://steamcommunity.com/openid/id/${steamId}`,
		"openid.identity": `https://steamcommunity.com/openid/id/${steamId}`,
		"openid.return_to": returnTo,
		"openid.response_nonce": `${new Date().toISOString().replace(/\.\d{3}Z$/, "Z")}nonce`,
		"openid.assoc_handle": "association",
		"openid.signed":
			"op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle",
		"openid.sig": "signature",
	});
	return new URL(`${redirectURI}?${params}`);
}

function validate(url = assertion()) {
	return steam({ apiKey: "private-api-key" }).validateAuthorizationCode({
		code: "",
		request: new Request(url),
		redirectURI,
	});
}

afterEach(() => vi.unstubAllGlobals());

/** @see https://openid.net/specs/openid-authentication-2_0.html#verification */
describe("Steam OpenID verification", () => {
	it("uses the verified Steam identity without a Web API key", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const provider = steam({});
		const url = await provider.createAuthorizationURL({
			state,
			redirectURI,
			codeVerifier: "unused",
		});
		expect(url.origin + url.pathname).toBe(endpoint);
		const info = await provider.getUserInfo({ raw: { steamId } });
		expect(info).toEqual({
			user: {
				name: steamId,
				image: undefined,
				email: `${steamId}@steam.placeholder.invalid`,
				emailVerified: false,
			},
			data: { steamid: steamId },
		});
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("does not accept an OAuth code as a Steam identity", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		expect(
			await steam({ apiKey: "private-api-key" }).validateAuthorizationCode({
				code: steamId,
				redirectURI,
			}),
		).toBeNull();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("binds the return URL to state and keeps credentials out of the authorization URL", async () => {
		const provider = steam({ apiKey: "private-api-key" });
		const url = await provider.createAuthorizationURL({
			state,
			redirectURI,
			codeVerifier: "unused",
			additionalParams: {
				"openid.return_to": "https://attacker.example",
				state: "forged",
			},
		});
		expect(url.origin + url.pathname).toBe(endpoint);
		expect(url.searchParams.get("openid.return_to")).toBe(
			`${redirectURI}?state=${state}`,
		);
		expect(url.searchParams.get("openid.realm")).toBe("https://app.example");
		expect(url.searchParams.get("openid.mode")).toBe("checkid_setup");
		expect(url.toString()).not.toContain("private-api-key");
	});

	it("verifies the signature with Steam and returns identity without OAuth tokens", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue(new Response(`ns:${namespace}\nis_valid:true\n`));
		vi.stubGlobal("fetch", fetchMock);
		const assertionURL = assertion();
		const tokens = await validate(assertionURL);
		expect(tokens).toEqual({ raw: { steamId } });
		const [url, init] = fetchMock.mock.calls[0]!;
		expect(url).toBe(endpoint);
		expect(init.method).toBe("POST");
		expect(init.redirect).toBe("manual");
		expect(init.body.get("openid.mode")).toBe("check_authentication");
		expect(init.body.get("openid.sig")).toBe("signature");
		for (const [key, value] of assertionURL.searchParams) {
			if (key.startsWith("openid.") && key !== "openid.mode") {
				expect(init.body.get(key)).toBe(value);
			}
		}
		expect(init.body.has("state")).toBe(false);
	});

	it.each([
		["openid.ns", "wrong"],
		["openid.mode", "cancel"],
		["openid.op_endpoint", "https://attacker.example/openid"],
		[
			"openid.claimed_id",
			"https://attacker.example/openid/id/76561198000000000",
		],
		[
			"openid.identity",
			"https://steamcommunity.com/openid/id/76561198000000001",
		],
		["openid.return_to", `${redirectURI}?state=wrong`],
		["openid.return_to", `https://attacker.example?state=${state}`],
		["openid.signed", "op_endpoint,claimed_id,identity,return_to,assoc_handle"],
		["openid.sig", ""],
		["openid.assoc_handle", ""],
	])("rejects invalid %s = %s before contacting Steam", async (key, value) => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const url = assertion();
		url.searchParams.set(key, value);
		expect(await validate(url)).toBeNull();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("rejects duplicate OpenID parameters and state", async () => {
		vi.stubGlobal("fetch", vi.fn());
		for (const key of ["openid.claimed_id", "state"]) {
			const url = assertion();
			url.searchParams.append(key, url.searchParams.get(key)!);
			expect(await validate(url)).toBeNull();
		}
	});

	it.each([
		"is_valid:false\n",
		"is_valid:true\nis_valid:false\n",
		"is_valid:true\n",
	])("rejects an invalid or malformed verification response", async (body) => {
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body)));
		expect(await validate()).toBeNull();
	});

	it("fails closed when Steam is unavailable", async () => {
		vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
		expect(await validate()).toBeNull();
	});

	it("rejects a redirect from Steam's verification endpoint", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(Response.redirect("https://other.example")),
		);
		expect(await validate()).toBeNull();
	});

	it("rejects assertions received at a different callback origin or path", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		for (const target of [
			"https://attacker.example",
			"https://app.example/other",
		]) {
			const url = new URL(target);
			url.search = assertion().search;
			expect(await validate(url)).toBeNull();
		}
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("loads the matching Steam profile with the server-side API key", async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			Response.json({
				response: {
					players: [
						{ steamid: "76561198000000001", personaname: "Other player" },
						{
							steamid: steamId,
							personaname: "Player",
							avatarfull: "https://example.com/avatar.jpg",
						},
					],
				},
			}),
		);
		vi.stubGlobal("fetch", fetchMock);
		const provider = steam({
			apiKey: "private-api-key",
			mapProfileToUser: () => ({ name: "Mapped" }),
		});
		const tokens = { raw: { steamId } };
		const info = await provider.getUserInfo(tokens);
		expect(info?.user).toMatchObject({
			name: "Mapped",
			image: "https://example.com/avatar.jpg",
			emailVerified: false,
		});
		expect(provider.accountSubject({ tokens, profile: info!.data })).toBe(
			steamId,
		);
		const url = new URL(fetchMock.mock.calls[0]![0]);
		expect(url.origin).toBe("https://api.steampowered.com");
		expect(url.searchParams.has("key")).toBe(false);
		expect(
			new Headers(fetchMock.mock.calls[0]![1].headers).get("x-webapi-key"),
		).toBe("private-api-key");
		expect(url.searchParams.get("steamids")).toBe(steamId);
	});

	it("rejects a mismatched API profile", async () => {
		const response = {
			response: { players: [{ steamid: "76561198000000001" }] },
		};
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(response)));
		expect(
			await steam({ apiKey: "key" }).getUserInfo({ raw: { steamId } }),
		).toBeNull();
	});

	it.each([
		Response.json({}, { status: 429 }),
		Response.json({ response: { players: [] } }),
		Response.json({}),
	])("uses the verified ID when profile lookup is unavailable: %#", async (response) => {
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
		const info = await steam({ apiKey: "key" }).getUserInfo({
			raw: { steamId },
		});
		expect(info?.user).toMatchObject({ name: steamId, emailVerified: false });
		expect(info?.data).toEqual({ steamid: steamId });
	});

	it("uses the verified ID when the profile request fails", async () => {
		vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
		const info = await steam({ apiKey: "key" }).getUserInfo({
			raw: { steamId },
		});
		expect(info?.user.name).toBe(steamId);
	});

	it("supports custom profile loading while binding account identity to the assertion", async () => {
		const getUserInfo = vi.fn(async () => ({
			user: {
				name: "Custom",
				email: "player@example.com",
				emailVerified: false,
			},
			data: { steamid: "76561198000000001" },
		}));
		const provider = steam({ apiKey: "private-api-key", getUserInfo });
		const tokens = { raw: { steamId } };
		const info = await provider.getUserInfo(tokens);
		expect(getUserInfo).toHaveBeenCalledWith(tokens);
		expect(info?.user.name).toBe("Custom");
		expect(provider.accountSubject({ tokens, profile: info!.data })).toBe(
			steamId,
		);
	});

	it("uses a stable, unverified placeholder email when Steam returns no email", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(
				Response.json({
					response: { players: [{ steamid: steamId, personaname: "Player" }] },
				}),
			),
		);
		const provider = steam({
			apiKey: "private-api-key",
			mapProfileToUser: () => ({ name: "Mapped name", emailVerified: true }),
		});
		const info = await provider.getUserInfo({ raw: { steamId } });
		expect(info?.user).toEqual({
			name: "Mapped name",
			email: `${steamId}@steam.placeholder.invalid`,
			image: undefined,
			emailVerified: false,
		});
		expect(
			provider.accountSubject({
				tokens: { raw: { steamId } },
				profile: info!.data,
			}),
		).toBe(steamId);
		expect(await provider.getUserInfo({ accessToken: steamId })).toBeNull();
	});
});
