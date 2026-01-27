import { it, testUtils } from "./utils";
import { describe, expect, vi } from "vitest";
import { authenticate, kCodeVerifier, kState } from "../src/authenticate";
import { parseSetCookieHeader } from "better-auth/cookies";
import { base64Url } from "@better-auth/utils/base64";
import { randomBytes } from "node:crypto";
import { createHash } from "@better-auth/utils/hash";
import { generateRandomString } from "better-auth/crypto";
import { getMigrations } from "better-auth/db/migration";
import { electron } from "../src/index";
import { createAuthMiddleware } from "@better-auth/core/api";

const mockElectron = vi.hoisted(() => {
  const BrowserWindow = {
    constructor: vi.fn(),
    send: vi.fn(),
    webContents: {
      send: vi.fn(),
    },
  };

  const electron = {
    ipcMain: {
      handle: vi.fn(),
    },
    app: {
      userAgentFallback: "test-user-agent",
      whenReady: vi.fn(() => Promise.resolve()),
      setAsDefaultProtocolClient: vi.fn(() => true),
      requestSingleInstanceLock: vi.fn(() => true),
      on: vi.fn(),
      quit: vi.fn(),
    },
    shell: {
      openExternal: vi.fn(),
    },
    safeStorage: {
      encryptString: vi.fn((str: string) =>
        Buffer.from(str).toString("base64"),
      ),
      decryptString: vi.fn((buf: Buffer) =>
        Buffer.from(buf.toString(), "base64").toString(),
      ),
    },
    webContents: {
      getFocusedWebContents: vi.fn(() => BrowserWindow),
    },
    session: {
      defaultSession: {
        webRequest: {
          onBeforeSendHeaders: vi.fn(),
          onHeadersReceived: vi.fn(),
        },
      },
    },
    protocol: {
      registerSchemesAsPrivileged: vi.fn(),
    },
    BrowserWindow,
  };

  return {
    ...electron,
    default: electron,
  };
});

vi.mock("electron", () => mockElectron);

describe("Electron", () => {
  const { auth, client, proxyClient, options } = testUtils();

  it("should throw error when making requests outside the main process", async ({
    setProcessType,
  }) => {
    setProcessType("renderer");

    await expect(client.getSession()).rejects.toThrowError(
      "Requests must be made from the Electron main process",
    );
  });

  it("should open external url in default browser", async ({
    setProcessType,
  }) => {
    setProcessType("browser");

    await client.requestAuth();

    (globalThis as any)[kCodeVerifier] = undefined;
    (globalThis as any)[kState] = undefined;

    expect(mockElectron.shell.openExternal).toHaveBeenCalledWith(
      expect.stringContaining(options.signInURL),
      {
        activate: true,
      },
    );
  });

  it("should set redirect cookie after signing in", async () => {
    (globalThis as any)[kCodeVerifier] = "test-challenge";
    (globalThis as any)[kState] = "abc";

    const { error } = await proxyClient.signUp.email(
      {
        email: "test@test.com",
        password: "password",
        name: "Test User",
      },
      {
        query: {
          client_id: "electron",
          code_challenge: "test-challenge",
          code_challenge_method: "plain",
          state: "abc",
        },
        onResponse: async (ctx) => {
          const cookies = parseSetCookieHeader(
            ctx.response.headers.get("set-cookie") || "",
          );

          const redirectCookie = cookies.get(`better-auth.electron`);
          expect(redirectCookie).toBeDefined();
          expect(redirectCookie?.httponly).not.toBe(true);
          expect(redirectCookie?.["max-age"]).toStrictEqual(120);
        },
        customFetchImpl: (url, init) => {
          const req = new Request(url.toString(), init);
          return auth.handler(req);
        },
      },
    );
    expect(error).toBeNull();
  });

  it("should exchange token", async ({ setProcessType }) => {
    setProcessType("browser");

    const { user } = await auth.api.signInEmail({
      body: {
        email: "test@test.com",
        password: "password",
      },
    });

    const codeVerifier = base64Url.encode(randomBytes(32));
    const codeChallenge = base64Url.encode(
      await createHash("SHA-256").digest(codeVerifier),
    );

    const identifier = generateRandomString(16, "A-Z", "a-z", "0-9");
    await (
      await auth.$context
    ).adapter.create({
      model: "verification",
      data: {
        identifier: `electron:${identifier}`,
        value: JSON.stringify({
          userId: user.id,
          codeChallenge,
          codeChallengeMethod: "s256",
          state: "abc",
        }),
        expiresAt: new Date(Date.now() + 300 * 1000),
      },
    });

    const { data } = await client.$fetch<any>("/electron/token", {
      method: "POST",
      body: {
        token: identifier,
        code_verifier: codeVerifier,
        state: "abc",
      },
      onResponse: async (ctx) => {
        const cookies = parseSetCookieHeader(
          ctx.response.headers.get("set-cookie") || "",
        );

        expect(cookies.has("better-auth.session_token")).toBe(true);
      },
    });

    expect(data?.token).toBeDefined();
    expect(data?.user.id).toBe(user.id);

    expect(mockElectron.safeStorage.encryptString).toHaveBeenCalled();
  });

  it("should emit authenticated event on success", async ({
    setProcessType,
  }) => {
    setProcessType("browser");

    const { user } = await auth.api.signInEmail({
      body: {
        email: "test@test.com",
        password: "password",
      },
    });

    (globalThis as any)[kCodeVerifier] = "test-challenge";
    (globalThis as any)[kState] = "abc";

    const identifier = generateRandomString(16, "A-Z", "a-z", "0-9");
    await (
      await auth.$context
    ).adapter.create({
      model: "verification",
      data: {
        identifier: `electron:${identifier}`,
        value: JSON.stringify({
          userId: user.id,
          codeChallenge: "test-challenge",
          codeChallengeMethod: "plain",
          state: "abc",
        }),
        expiresAt: new Date(Date.now() + 300 * 1000),
      },
    });

    await expect(
      authenticate(
        client.$fetch,
        options,
        {
          token: identifier,
        },
        // @ts-expect-error
        () => mockElectron.BrowserWindow,
      ),
    ).resolves.toBeUndefined();

    expect(mockElectron.BrowserWindow.webContents.send).toHaveBeenCalledWith(
      "auth:authenticated",
      expect.objectContaining({
        id: user.id,
      }),
    );
  });

  it("should reject expired tokens", async ({ setProcessType }) => {
    setProcessType("browser");
    const { user } = await auth.api.signInEmail({
      body: {
        email: "test@test.com",
        password: "password",
      },
    });

    (globalThis as any)[kCodeVerifier] = "test-challenge";
    (globalThis as any)[kState] = "abc";

    const identifier = generateRandomString(16, "A-Z", "a-z", "0-9");
    await (
      await auth.$context
    ).adapter.create({
      model: "verification",
      data: {
        identifier: `electron:${identifier}`,
        value: JSON.stringify({
          userId: user.id,
          codeChallenge: "test-challenge",
          codeChallengeMethod: "plain",
          state: "abc",
        }),
        expiresAt: new Date(Date.now() + 999),
      },
    });

    vi.advanceTimersByTime(1000);

    await expect(
      authenticate(
        client.$fetch,
        options,
        {
          token: identifier,
        },
        // @ts-expect-error
        () => mockElectron.BrowserWindow,
      ).catch((err: any) => {
        expect(err.error.message).toBe("Invalid or expired token.");
        throw err;
      }),
    ).rejects.toThrowError("NOT_FOUND");
  });

  it("should reject invalid/non-existent tokens", async ({
    setProcessType,
  }) => {
    setProcessType("browser");

    (globalThis as any)[kCodeVerifier] = "test-challenge";
    (globalThis as any)[kState] = "abc";

    await expect(
      authenticate(
        client.$fetch,
        options,
        {
          token: "non-existent",
        },
        // @ts-expect-error
        () => mockElectron.BrowserWindow,
      ).catch((err: any) => {
        expect(err.error.message).toBe("Invalid or expired token.");
        throw err;
      }),
    ).rejects.toThrowError("NOT_FOUND");
  });

  it("should emit error event on failure", async ({ setProcessType }) => {
    setProcessType("browser");

    await client.changeEmail({
      // @ts-expect-error
      newEmail: null,
    });

    expect(mockElectron.BrowserWindow.send).toHaveBeenCalledWith(
      "better-auth:error",
      expect.objectContaining({
        status: 400,
      }),
    );
  });

  it("should error when user referenced by token does not exist", async ({
    setProcessType,
  }) => {
    setProcessType("browser");

    // Create verification referencing a non-existent user id
    const identifier = generateRandomString(16, "A-Z", "a-z", "0-9");
    await (
      await auth.$context
    ).adapter.create({
      model: "verification",
      data: {
        identifier: `electron:${identifier}`,
        value: JSON.stringify({
          userId: "non-existent-user",
          codeChallenge: "x",
          codeChallengeMethod: "plain",
          state: "abc",
        }),
        expiresAt: new Date(Date.now() + 300_000),
      },
    });

    await expect(
      client
        .$fetch("/electron/token", {
          method: "POST",
          body: { token: identifier, code_verifier: "x", state: "abc" },
          throw: true,
          customFetchImpl: (url, init) => {
            const req = new Request(url.toString(), init);
            return auth.handler(req);
          },
        })
        .catch((err) => {
          throw err.cause;
        }),
    ).rejects.toThrow(
      expect.objectContaining({
        code: auth.$ERROR_CODES.USER_NOT_FOUND.code,
      }),
    );
  });

  it("should throw when createSession returns null", async ({
    setProcessType,
  }) => {
    setProcessType("browser");

    const { user } = await auth.api.signUpEmail({
      body: {
        name: "Test User",
        email: "test-create-session-null@test.com",
        password: "password",
      },
    });

    const identifier = generateRandomString(16, "A-Z", "a-z", "0-9");
    await (
      await auth.$context
    ).adapter.create({
      model: "verification",
      data: {
        identifier: `electron:${identifier}`,
        value: JSON.stringify({
          userId: user.id,
          codeChallenge: "x",
          codeChallengeMethod: "plain",
          state: "abc",
        }),
        expiresAt: new Date(Date.now() + 300_000),
      },
    });

    const ctx = await auth.$context;
    const original = ctx.internalAdapter.createSession;
    try {
      ctx.internalAdapter.createSession = vi.fn().mockResolvedValue(null);
      await expect(
        client.$fetch("/electron/token", {
          method: "POST",
          body: { token: identifier, code_verifier: "x", state: "abc" },
          throw: true,
          customFetchImpl: (url, init) => {
            const req = new Request(url.toString(), init);
            return auth.handler(req);
          },
        }),
      ).rejects.toThrow(/FAILED_TO_CREATE_SESSION|INTERNAL_SERVER_ERROR/);
    } finally {
      ctx.internalAdapter.createSession = original;
    }
  });

  it("requestAuth should throw if called outside browser process", async ({
    setProcessType,
  }) => {
    setProcessType("renderer");
    await expect(client.requestAuth()).rejects.toThrowError(
      "`requestAuth` can only be called in the main process",
    );
  });

  it("should delete verification entry after successful token exchange", async ({
    setProcessType,
  }) => {
    setProcessType("browser");

    const { user } = await auth.api.signUpEmail({
      body: {
        name: "Test User",
        email: "test-delete-verification@test.com",
        password: "password",
      },
    });

    const codeVerifier = base64Url.encode(randomBytes(32));
    const codeChallenge = base64Url.encode(
      await createHash("SHA-256").digest(codeVerifier),
    );

    const identifier = generateRandomString(16, "A-Z", "a-z", "0-9");
    await (
      await auth.$context
    ).adapter.create({
      model: "verification",
      data: {
        identifier: `electron:${identifier}`,
        value: JSON.stringify({
          userId: user.id,
          codeChallenge,
          codeChallengeMethod: "s256",
          state: "abc",
        }),
        expiresAt: new Date(Date.now() + 300 * 1000),
      },
    });

    const ctx = await auth.$context;
    const spy = vi.spyOn(ctx.internalAdapter, "deleteVerificationValue");

    const { data } = await client.$fetch<any>("/electron/token", {
      method: "POST",
      body: {
        token: identifier,
        code_verifier: codeVerifier,
        state: "abc",
      },
    });

    expect(data?.token).toBeDefined();
    expect(data?.user.id).toBe(user.id);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("should register protocol", async ({ setProcessType }) => {
    setProcessType("browser");

    client.setupMain({
      scheme: true,
    });

    expect(
      mockElectron.protocol.registerSchemesAsPrivileged,
    ).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          scheme: options.protocol.scheme,
        }),
      ]),
    );
    expect(mockElectron.app.setAsDefaultProtocolClient).toHaveBeenCalledWith(
      options.protocol.scheme,
    );
  });

  it("should add client origin to CSP if missing", async ({
    setProcessType,
  }) => {
    setProcessType("browser");

    client.setupMain({
      csp: true,
    });

    // wait a tick for whenReady then-callback to run
    await Promise.resolve();

    const onHeadersReceived =
      mockElectron.session.defaultSession.webRequest.onHeadersReceived;
    expect(onHeadersReceived).toHaveBeenCalled();

    const handler = onHeadersReceived.mock.calls[0][0];

    const details = {
      responseHeaders: {},
    };

    let callbackResult: any = null;
    const callback = (res: any) => {
      callbackResult = res;
    };

    await handler(details, callback);

    expect(callbackResult).not.toBeNull();
    const respHeaders = callbackResult.responseHeaders;
    expect(respHeaders).toBeDefined();
    const csp = String(respHeaders["content-security-policy"]);
    expect(csp).toContain("connect-src");
    expect(csp).toContain("http://localhost:3000");
  });

  describe("pkce", () => {
    it("should require pkce", async ({ setProcessType }) => {
      setProcessType("browser");

      const { user } = await auth.api.signInEmail({
        body: {
          email: "test@test.com",
          password: "password",
        },
      });

      const identifier = generateRandomString(16, "A-Z", "a-z", "0-9");
      await (
        await auth.$context
      ).adapter.create({
        model: "verification",
        data: {
          identifier: `electron:${identifier}`,
          value: JSON.stringify({
            userId: user.id,
          }),
          expiresAt: new Date(Date.now() + 300 * 1000),
        },
      });

      await expect(
        authenticate(
          client.$fetch,
          options,
          {
            token: identifier,
          },
          // @ts-expect-error
          () => mockElectron.BrowserWindow,
        ),
      ).rejects.toThrowError("Code verifier not found.");
    });

    it("should require a state parameter", async ({ setProcessType }) => {
      setProcessType("browser");

      const { user } = await auth.api.signInEmail({
        body: {
          email: "test@test.com",
          password: "password",
        },
      });

      (globalThis as any)[kCodeVerifier] = "test-challenge";

      const identifier = generateRandomString(16, "A-Z", "a-z", "0-9");
      await (
        await auth.$context
      ).adapter.create({
        model: "verification",
        data: {
          identifier: `electron:${identifier}`,
          value: JSON.stringify({
            userId: user.id,
            codeChallenge: "test-challenge",
            codeChallengeMethod: "plain",
          }),
          expiresAt: new Date(Date.now() + 300 * 1000),
        },
      });

      await expect(
        authenticate(
          client.$fetch,
          options,
          {
            token: identifier,
          },
          // @ts-expect-error
          () => mockElectron.BrowserWindow,
        ),
      ).rejects.toThrowError("State not found.");
    });

    it("should verify that state parameter matches", async ({
      setProcessType,
    }) => {
      setProcessType("browser");

      const { user } = await auth.api.signInEmail({
        body: {
          email: "test@test.com",
          password: "password",
        },
      });

      (globalThis as any)[kCodeVerifier] = "test-challenge";
      (globalThis as any)[kState] = "abc";

      const identifier = generateRandomString(16, "A-Z", "a-z", "0-9");
      await (
        await auth.$context
      ).adapter.create({
        model: "verification",
        data: {
          identifier: `electron:${identifier}`,
          value: JSON.stringify({
            userId: user.id,
            codeChallenge: "test-challenge",
            codeChallengeMethod: "plain",
            state: "def",
          }),
          expiresAt: new Date(Date.now() + 300 * 1000),
        },
      });

      await expect(
        authenticate(
          client.$fetch,
          options,
          {
            token: identifier,
          },
          // @ts-expect-error
          () => mockElectron.BrowserWindow,
        ).catch((err: any) => {
          expect(err.error.message).toBe("state mismatch");
          throw err;
        }),
      ).rejects.toThrowError("BAD_REQUEST");
    });

    it("should return error when token record is missing code challenge", async ({
      setProcessType,
    }) => {
      setProcessType("browser");

      const { user } = await auth.api.signInEmail({
        body: { email: "test@test.com", password: "password" },
      });

      const identifier = generateRandomString(16, "A-Z", "a-z", "0-9");
      await (
        await auth.$context
      ).adapter.create({
        model: "verification",
        data: {
          identifier: `electron:${identifier}`,
          value: JSON.stringify({
            userId: user.id,
            state: "abc",
          }),
          expiresAt: new Date(Date.now() + 300_000),
        },
      });

      await expect(
        client.$fetch("/electron/token", {
          method: "POST",
          body: { token: identifier, code_verifier: "anything", state: "abc" },
          throw: true,
          customFetchImpl: (url, init) => {
            const req = new Request(url.toString(), init);
            return auth.handler(req);
          },
        }),
      ).rejects.toThrowError("BAD_REQUEST");
    });

    it("should reject when code_verifier does not match", async ({
      setProcessType,
    }) => {
      setProcessType("browser");

      const { user } = await auth.api.signInEmail({
        body: { email: "test@test.com", password: "password" },
      });

      const actualVerifier = base64Url.encode(randomBytes(32));
      const actualChallenge = base64Url.encode(
        await createHash("SHA-256").digest(actualVerifier),
      );

      const identifier = generateRandomString(16, "A-Z", "a-z", "0-9");
      await (
        await auth.$context
      ).adapter.create({
        model: "verification",
        data: {
          identifier: `electron:${identifier}`,
          value: JSON.stringify({
            userId: user.id,
            codeChallenge: actualChallenge,
            codeChallengeMethod: "s256",
            state: "abc",
          }),
          expiresAt: new Date(Date.now() + 300_000),
        },
      });

      const invalidVerifier = base64Url.encode(randomBytes(32));
      await expect(
        client.$fetch("/electron/token", {
          method: "POST",
          body: {
            token: identifier,
            code_verifier: invalidVerifier,
            state: "abc",
          },
          throw: true,
          customFetchImpl: (url, init) => {
            const req = new Request(url.toString(), init);
            return auth.handler(req);
          },
        }),
      ).rejects.toThrowError("BAD_REQUEST");
    });
  });

  describe("cookies", () => {
    it("should send cookie and get session", async ({ setProcessType }) => {
      setProcessType("browser");

      const { data } = await client.getSession();
      expect(data).toMatchObject({
        session: expect.any(Object),
        user: expect.any(Object),
      });

      expect(mockElectron.safeStorage.decryptString).toHaveBeenCalled();
    });

    it("should get cookies", async () => {
      const c = client.getCookie();
      expect(c).includes("better-auth.session_token");
    });

    it("should not trigger infinite refetch with non-./src/cookies", async ({
      setProcessType,
    }) => {
      setProcessType("browser");

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
      expect(hasBetterAuthCookies(customPrefixHeader, "better-auth")).toBe(
        false,
      );

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
      expect(hasBetterAuthCookies(securePasskeyHeader, "better-auth")).toBe(
        true,
      );

      // Custom passkey cookie name should be detected
      const customPasskeyHeader = "better-auth-custom-challenge=xyz; Path=/";
      expect(hasBetterAuthCookies(customPasskeyHeader, "better-auth")).toBe(
        true,
      );
    });

    it("should allow independent cookiePrefix configuration", async () => {
      const { hasBetterAuthCookies } = await import("../src/cookies");

      const customCookieHeader = "my-app.session_token=abc; Path=/";

      expect(hasBetterAuthCookies(customCookieHeader, "my-app")).toBe(true);

      expect(hasBetterAuthCookies(customCookieHeader, "better-auth")).toBe(
        false,
      );
    });

    it("should support array of cookie prefixes", async () => {
      const { hasBetterAuthCookies } = await import("../src/cookies");

      // Test with multiple prefixes - should match any of them
      const betterAuthHeader = "better-auth.session_token=abc; Path=/";
      expect(
        hasBetterAuthCookies(betterAuthHeader, ["better-auth", "my-app"]),
      ).toBe(true);

      const myAppHeader = "my-app.session_data=xyz; Path=/";
      expect(hasBetterAuthCookies(myAppHeader, ["better-auth", "my-app"])).toBe(
        true,
      );

      const otherAppHeader = "other-app.session_token=def; Path=/";
      expect(
        hasBetterAuthCookies(otherAppHeader, ["better-auth", "my-app"]),
      ).toBe(false);

      // Test with passkey cookies
      const passkeyHeader1 = "better-auth-passkey=xyz; Path=/";
      expect(
        hasBetterAuthCookies(passkeyHeader1, ["better-auth", "my-app"]),
      ).toBe(true);

      const passkeyHeader2 = "my-app-passkey=xyz; Path=/";
      expect(
        hasBetterAuthCookies(passkeyHeader2, ["better-auth", "my-app"]),
      ).toBe(true);

      // Test with __Secure- prefix
      const secureHeader = "__Secure-my-app.session_token=abc; Path=/";
      expect(
        hasBetterAuthCookies(secureHeader, ["better-auth", "my-app"]),
      ).toBe(true);

      // Test with empty array (should check for suffixes)
      const sessionTokenHeader = "session_token=abc; Path=/";
      expect(hasBetterAuthCookies(sessionTokenHeader, [])).toBe(false);
      expect(hasBetterAuthCookies(sessionTokenHeader, [""])).toBe(true);
    });
  });

  it("should preserve unchanged client store session properties on signout", async ({
    setProcessType,
  }) => {
    setProcessType("browser");

    await client.signUp.email({
      name: "Test User",
      email: "test-2@test.com",
      password: "password",
    });

    const before = client.$store.atoms.session!.get();
    await client.signOut();
    const after = client.$store.atoms.session!.get();

    expect(after).toMatchObject({
      ...before,
      data: null,
      error: null,
      isPending: false,
    });
  });

  it("should modify origin header to electron origin if origin is not set", async ({
    setProcessType,
  }) => {
    setProcessType("browser");

    let originalOrigin: string | null = null;
    let origin: string | null = null;
    const { auth, client } = testUtils({
      hooks: {
        before: createAuthMiddleware(async (ctx) => {
          origin = ctx.request?.headers.get("origin") ?? null;
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
    await client.signUp.email({
      name: "Test User",
      email: "test@test.com",
      password: "password",
      callbackURL: "http://localhost:3000/callback",
    });
    expect(origin).toBe("myapp:/");
    expect(originalOrigin).toBeNull();
  });

  it("should not modify origin header if origin is set", async ({
    setProcessType,
  }) => {
    setProcessType("browser");

    let originalOrigin = "test.com";
    let origin: string | null = null;
    const { auth, client } = testUtils({
      hooks: {
        before: createAuthMiddleware(async (ctx) => {
          origin = ctx.request?.headers.get("origin") ?? null;
        }),
      },
      plugins: [electron()],
    });
    const { runMigrations } = await getMigrations(auth.options);
    await runMigrations();
    await client.signUp.email(
      {
        name: "Test User",
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

  it("should not modify origin header if disableOriginOverride is set", async ({
    setProcessType,
  }) => {
    setProcessType("browser");

    let origin: string | null = null;
    const { auth, client } = testUtils({
      plugins: [electron({ disableOriginOverride: true })],
      hooks: {
        before: createAuthMiddleware(async (ctx) => {
          origin = ctx.request?.headers.get("origin") ?? null;
        }),
      },
    });
    const { runMigrations } = await getMigrations(auth.options);
    await runMigrations();
    await client.signUp.email({
      name: "Test User",
      email: "test@test.com",
      password: "password",
      callbackURL: "http://localhost:3000/callback",
    });
    expect(origin).toBe(null);
  });
});
