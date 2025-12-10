import { describe, it, expect, vi, beforeAll } from "vitest";
import { createAuthClient, type FetchEsque } from "better-auth/client";
import { electronClient, type ElectronClientOptions } from "../src/client";
import { betterAuth } from "better-auth";
import { electron } from "../src";
import { oAuthProxy } from "better-auth/plugins";
import Database from "better-sqlite3";
import { electronProxyClient } from "../src/proxy";
import { getMigrations } from "better-auth/db";
import { createAuthMiddleware } from "better-auth/api";
import { parseSetCookieHeader } from "better-auth/cookies";
import { generateRandomString } from "better-auth/crypto";

const mockElectron = vi.hoisted(() => {
  return {
    shell: {
      openExternal: vi.fn(),
    },
    safeStorage: {
      encryptString: (str: string) => Buffer.from(str).toString("base64"),
      decryptString: (buf: Buffer) => Buffer.from(buf.toString(), "base64").toString(),
    }
  }
})

vi.mock("electron", () => {
  return mockElectron;
});

function testUtils(extraOpts?: Parameters<typeof betterAuth>[0]) {
  const storage = new Map<string, string>();
  const options = {
    protocol: {
      scheme: "myapp"
    },
    storage: {
      get: (key) => storage.get(key) || null,
      set: (key, value) => storage.set(key, new TextDecoder().decode(Buffer.from(value))),
    },
    redirectURL: "http://localhost:3000/sign-in"
  } satisfies ElectronClientOptions;

  const auth = betterAuth({
    baseURL: "http://localhost:3000",
    database: new Database(":memory:"),
    emailAndPassword: {
      enabled: true,
    },
    socialProviders: {
      google: {
        clientId: "test",
        clientSecret: "test",
      },
    },
    plugins: [
      electron(),
      oAuthProxy()
    ],
    trustedOrigins: ["myapp:/"],
    ...extraOpts,
  })

  const customFetchImpl: FetchEsque = (url, init) => {
    const req = new Request(url.toString(), init);
    return auth.handler(req);
  }

  const proxyClient = createAuthClient({
    baseURL: "http://localhost:3000",
    fetchOptions: {
      customFetchImpl
    },
    plugins: [
      electronProxyClient(options)
    ]
  })

  const client = createAuthClient({
    baseURL: "http://localhost:3000",
    fetchOptions: {
      customFetchImpl,
    },
    plugins: [
      electronClient(options)
    ]
  })

  return { auth, proxyClient, client, options };
}

describe("electron", () => {
  const { auth, client, proxyClient, options } = testUtils();

  beforeAll(async () => {
    const { runMigrations } = await getMigrations(auth.options);
    await runMigrations();
  })

  it("should open external url in default browser", async () => {
    await client.requestAuth();

    expect(mockElectron.shell.openExternal).toHaveBeenCalledWith(options.redirectURL, {
      activate: true,
    });
  });

  it("should set redirect cookie after signing in", async () => {
    const { error } = await proxyClient.signUp.email({
      email: "test@test.com",
      password: "password",
      name: "Test User",
    }, {
      query: {
        client_id: "electron",
      },
      onResponse: async (ctx) => {
        const cookies = parseSetCookieHeader(ctx.response.headers.get("set-cookie") || "")

        const redirectCookie = cookies.get("better-auth.redirect_client");
        expect(redirectCookie).toBeDefined();
        expect(redirectCookie?.value.startsWith("electron")).toBe(true);
        expect(redirectCookie?.httponly).not.toBe(true);
        expect(redirectCookie?.["max-age"]).toStrictEqual(600);
      },
      customFetchImpl: (url, init) => {
        const req = new Request(url.toString(), init);
        return auth.handler(req);
      }
    });
    expect(error).toBeNull();
  })

  it("should exchange token", async () => {
    const { user } = await auth.api.signInEmail({
      body: {
        email: "test@test.com",
        password: "password",
      }
    });

    const identifier = generateRandomString(16, "A-Z", "a-z", "0-9");
    await (await auth.$context).adapter.create({
      model: "verification",
      data: {
        identifier: `electron:${identifier}`,
        value: JSON.stringify({
          userId: user.id,
        }),
        expiresAt: new Date(Date.now() + 600 * 1000),
      }
    })

    const { data } = await client.$fetch<any>("/electron/token", {
      method: "POST",
      body: {
        token: identifier,
      },
      onResponse: async (ctx) => {
        const cookies = parseSetCookieHeader(ctx.response.headers.get("set-cookie") || "")

        expect(cookies.has("better-auth.session_token")).toBe(true);
      }
    })

    expect(data?.token).toBeDefined();
    expect(data?.user.id).toBe(user.id);
  })

  it("should send cookie and get session", async () => {
    const { data } = await client.getSession();
    expect(data).toMatchObject({
      session: expect.any(Object),
      user: expect.any(Object),
    });
  });

  it("should get cookies", async () => {
    const c = await client.getCookie();
    expect(c).includes("better-auth.session_token");
  })

  it("should not trigger infinite refetch with non-better-auth cookies", async () => {
    const { hasBetterAuthCookies } = await import("../src/cookies");

    const betterAuthOnlyHeader = "better-auth.session_token=abc; Path=/";
		expect(hasBetterAuthCookies(betterAuthOnlyHeader, "better-auth")).toBe(
			true,
		);

		const sessionDataHeader = "better-auth.session_data=xyz; Path=/";
		expect(hasBetterAuthCookies(sessionDataHeader, "better-auth")).toBe(true);

		const secureBetterAuthHeader =
			"__Secure-better-auth.session_token=abc; Path=/";
		expect(hasBetterAuthCookies(secureBetterAuthHeader, "better-auth")).toBe(
			true,
		);

		const secureSessionDataHeader =
			"__Secure-better-auth.session_data=xyz; Path=/";
		expect(hasBetterAuthCookies(secureSessionDataHeader, "better-auth")).toBe(
			true,
		);

		const nonBetterAuthHeader = "__cf_bm=abc123; Path=/; HttpOnly; Secure";
		expect(hasBetterAuthCookies(nonBetterAuthHeader, "better-auth")).toBe(
			false,
		);

		const mixedHeader =
			"__cf_bm=abc123; Path=/; HttpOnly; Secure, better-auth.session_token=xyz; Path=/";
		expect(hasBetterAuthCookies(mixedHeader, "better-auth")).toBe(true);

		const customPrefixHeader = "my-app.session_token=abc; Path=/";
		expect(hasBetterAuthCookies(customPrefixHeader, "my-app")).toBe(true);
		expect(hasBetterAuthCookies(customPrefixHeader, "better-auth")).toBe(false);

		const customPrefixDataHeader = "my-app.session_data=abc; Path=/";
		expect(hasBetterAuthCookies(customPrefixDataHeader, "my-app")).toBe(true);

		const emptyPrefixHeader = "session_token=abc; Path=/";
		expect(hasBetterAuthCookies(emptyPrefixHeader, "")).toBe(true);

		const customFullNameHeader = "my_custom_session_token=abc; Path=/";
		expect(hasBetterAuthCookies(customFullNameHeader, "")).toBe(true);

		const customFullDataHeader = "my_custom_session_data=xyz; Path=/";
		expect(hasBetterAuthCookies(customFullDataHeader, "")).toBe(true);

		const multipleNonBetterAuthHeader =
			"__cf_bm=abc123; Path=/, _ga=GA1.2.123456789.1234567890; Path=/";
		expect(
			hasBetterAuthCookies(multipleNonBetterAuthHeader, "better-auth"),
		).toBe(false);

		// Non-session better-auth cookies should still be detected (e.g., passkey cookies)
		const nonSessionBetterAuthHeader = "better-auth.other_cookie=abc; Path=/";
		expect(
			hasBetterAuthCookies(nonSessionBetterAuthHeader, "better-auth"),
		).toBe(true);

		// Passkey cookie should be detected
		const passkeyHeader = "better-auth-passkey=xyz; Path=/";
		expect(hasBetterAuthCookies(passkeyHeader, "better-auth")).toBe(true);

		// Secure passkey cookie should be detected
		const securePasskeyHeader = "__Secure-better-auth-passkey=xyz; Path=/";
		expect(hasBetterAuthCookies(securePasskeyHeader, "better-auth")).toBe(true);

		// Custom passkey cookie name should be detected
		const customPasskeyHeader = "better-auth-custom-challenge=xyz; Path=/";
		expect(hasBetterAuthCookies(customPasskeyHeader, "better-auth")).toBe(true);
  });

  it("should preserve unchanged client store session properties on signout", async () => {
    const before = client.$store.atoms.session!.get();
    await client.signOut();
    const after = client.$store.atoms.session!.get();

    expect(after).toMatchObject({
			...before,
			data: null,
			error: null,
			isPending: false,
		});
  })

  it("should modify origin header to electron origin if origin is not set", async () => {
		let originalOrigin = null;
		let origin = null;
		const { auth, client } = testUtils({
			hooks: {
				before: createAuthMiddleware(async (ctx) => {
					origin = ctx.request?.headers.get("origin");
				}),
			},
			plugins: [
				{
					id: "test",
					async onRequest(request, ctx) {
						const origin = request.headers.get("origin");
						originalOrigin = origin;
					},
				},
				electron(),
			],
		});
		const { runMigrations } = await getMigrations(auth.options);
		await runMigrations();
		await client.signIn.email({
			email: "test@test.com",
			password: "password",
			callbackURL: "http://localhost:3000/callback",
		});
		expect(origin).toBe("myapp:/");
		expect(originalOrigin).toBeNull();
	});

  it("should not modify origin header if origin is set", async () => {
		let originalOrigin = "test.com";
		let origin = null;
		const { auth, client } = testUtils({
			hooks: {
				before: createAuthMiddleware(async (ctx) => {
					origin = ctx.request?.headers.get("origin");
				}),
			},
			plugins: [electron()],
		});
		const { runMigrations } = await getMigrations(auth.options);
		await runMigrations();
		await client.signIn.email(
			{
				email: "test@test.com",
				password: "password",
				callbackURL: "http://localhost:3000/callback",
			},
			{
				headers: {
					origin: originalOrigin,
				},
			},
		);
		expect(origin).toBe(originalOrigin);
	});

  it("should not modify origin header if disableOriginOverride is set", async () => {
		let origin = null;
		const { auth, client } = testUtils({
			plugins: [electron({ disableOriginOverride: true })],
			hooks: {
				before: createAuthMiddleware(async (ctx) => {
					origin = ctx.request?.headers.get("origin");
				}),
			},
		});
		const { runMigrations } = await getMigrations(auth.options);
		await runMigrations();
		await client.signIn.email({
			email: "test@test.com",
			password: "password",
			callbackURL: "http://localhost:3000/callback",
		});
		expect(origin).toBe(null);
	});
})
