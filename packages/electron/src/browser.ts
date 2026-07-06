import { resolve } from "node:path";
import type { BetterAuthClientOptions, ClientStore } from "@better-auth/core";
import type { User } from "@better-auth/core/db";
import { BetterAuthError } from "@better-auth/core/error";
import type { BetterFetch } from "@better-fetch/fetch";
import electron from "electron";
import { authenticate, requestAuth } from "./authenticate";
import type {
	ElectronClientOptions,
	ElectronRequestAuthOptions,
} from "./client";
import { fetchUserImage, normalizeUserOutput } from "./user";
import {
	getChannelPrefixWithDelimiter,
	isProcessType,
	parseProtocolScheme,
} from "./utils";

const { app, session, protocol, BrowserWindow, ipcMain, webContents } =
	electron;

export function withGetWindowFallback(
	win?: (() => Electron.BrowserWindow | null | undefined) | undefined,
) {
	return (
		win ??
		(() => {
			const allWindows = BrowserWindow.getAllWindows();
			return allWindows.length > 0 ? allWindows[0] : null;
		})
	);
}

export type SetupMainConfig = {
	getWindow?: () => electron.BrowserWindow | null | undefined;
	csp?: boolean | undefined;
	bridges?: boolean | undefined;
	scheme?: boolean | undefined;
};
export function setupMain(
	$fetch: BetterFetch,
	$store: ClientStore | null,
	getCookie: () => string,
	opts: ElectronClientOptions,
	clientOptions: BetterAuthClientOptions | undefined,
	cfg?: SetupMainConfig | undefined,
) {
	if (!isProcessType("browser")) {
		throw new BetterAuthError(
			"setupMain can only be called in the main process.",
		);
	}

	const getWindow = withGetWindowFallback(cfg?.getWindow);

	if (!cfg || cfg.csp === true) {
		setupCSP(clientOptions, opts);
	}
	if (!cfg || cfg.scheme === true) {
		registerProtocolScheme($fetch, opts, getWindow, clientOptions);
	}
	if (!cfg || cfg.bridges === true) {
		setupBridges(
			{
				$fetch,
				$store,
				getCookie,
				getWindow,
			},
			opts,
			clientOptions,
		);
	}
	if (opts.userImageProxy?.enabled !== false) {
		setupUserImageProxy(
			{
				$fetch,
				getCookie,
			},
			opts,
			clientOptions,
		);
	}
}

/**
 * Handles the deep link URL for authentication.
 */
export async function handleDeepLink({
	$fetch,
	options,
	url,
	getWindow,
	clientOptions,
}: {
	$fetch: BetterFetch;
	options: ElectronClientOptions;
	url: string;
	getWindow?: SetupMainConfig["getWindow"] | undefined;
	clientOptions?: BetterAuthClientOptions | undefined;
}) {
	if (!isProcessType("browser")) {
		throw new BetterAuthError(
			"`handleDeepLink` can only be called in the main process.",
		);
	}

	let parsedURL: URL | null = null;
	try {
		parsedURL = new URL(url);
	} catch {}
	if (!parsedURL) {
		return;
	}

	const { scheme } = parseProtocolScheme(options.protocol);

	if (!url.startsWith(`${scheme}:/`)) {
		return;
	}
	const { protocol, pathname, hostname, hash } = parsedURL;
	if (protocol !== `${scheme}:`) {
		return;
	}

	const path = "/" + hostname + pathname;

	if (path !== (options.callbackPath || "/auth/callback")) {
		return;
	}

	if (!hash.startsWith("#token=")) {
		return;
	}

	const token = hash.substring("#token=".length);

	await authenticate({
		$fetch,
		fetchOptions: {
			throw: true,
		},
		token,
		getWindow: withGetWindowFallback(getWindow),
		options,
	});
}

function registerProtocolScheme(
	$fetch: BetterFetch,
	options: ElectronClientOptions,
	getWindow: () => electron.BrowserWindow | null | undefined,
	clientOptions: BetterAuthClientOptions | undefined,
) {
	const { scheme, privileges = {} } =
		typeof options.protocol === "string"
			? {
					scheme: options.protocol,
				}
			: options.protocol;

	protocol.registerSchemesAsPrivileged([
		{
			scheme,
			privileges: {
				standard: false,
				secure: true,
				...privileges,
			},
		},
	]);

	let hasSetupProtocolClient = false;
	if (process?.defaultApp) {
		if (process.argv.length >= 2 && typeof process.argv[1] === "string") {
			hasSetupProtocolClient = app.setAsDefaultProtocolClient(
				scheme,
				process.execPath,
				[resolve(process.argv[1])],
			);
		}
	} else {
		hasSetupProtocolClient = app.setAsDefaultProtocolClient(scheme);
	}

	if (!hasSetupProtocolClient) {
		console.error(
			`Failed to register protocol ${scheme} as default protocol client.`,
		);
	}

	const gotTheLock = app.requestSingleInstanceLock();

	if (!gotTheLock) {
		app.quit();
	} else {
		app.on("second-instance", async (_event, commandLine, _workingDir, url) => {
			// Someone tried to run a second instance, we should focus our window.
			const win = getWindow();
			if (win) {
				if (win.isMinimized()) win.restore();
				win.focus();
			}

			if (!url) {
				const maybeURL = commandLine.pop();
				if (typeof maybeURL === "string" && maybeURL.trim() !== "") {
					try {
						url = new URL(maybeURL).toString();
					} catch {
						//
					}
				}
			}

			if (process?.platform !== "darwin" && typeof url === "string") {
				await handleDeepLink({
					$fetch,
					options,
					url,
					getWindow,
					clientOptions,
				});
			}
		});

		app.on("open-url", async (_event, url) => {
			if (process?.platform === "darwin") {
				await handleDeepLink({
					$fetch,
					options,
					url,
					getWindow,
					clientOptions,
				});
			}
		});

		app.whenReady().then(async () => {
			if (
				process?.platform !== "darwin" &&
				typeof process.argv[1] === "string"
			) {
				await handleDeepLink({
					$fetch,
					options,
					url: process.argv[1],
					getWindow,
					clientOptions,
				});
			}
		});
	}
}

function setupCSP(
	clientOptions: BetterAuthClientOptions | undefined,
	options: ElectronClientOptions,
) {
	app.whenReady().then(() => {
		session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
			const origin = new URL(clientOptions?.baseURL || "", "http://localhost")
				.origin;
			const cspKey = Object.keys(details.responseHeaders || {}).find(
				(k) => k.toLowerCase() === "content-security-policy",
			);
			if (!cspKey) {
				return callback({
					responseHeaders: {
						...(details.responseHeaders || {}),
						"content-security-policy": `connect-src 'self' ${origin}`,
					},
				});
			}
			const policy = details.responseHeaders?.[cspKey]?.toString() || "";
			const csp = new Map<string, string[]>();

			for (let token of policy.split(";")) {
				token = token.trim();

				if (!token || !/^[\x00-\x7f]*$/.test(token)) continue;

				const [rawDirectiveName, ...directiveValue] = token.split(/\s+/);
				const directiveName = rawDirectiveName?.toLowerCase();
				if (!directiveName) continue;

				if (csp.has(directiveName)) continue;

				csp.set(directiveName, directiveValue);
			}

			if (csp.has("connect-src")) {
				const values = csp.get("connect-src") || [];
				if (!values.includes(origin)) {
					values.push(origin);
				}
				csp.set("connect-src", values);
			} else {
				csp.set("connect-src", ["'self'", origin]);
			}

			const userImageScheme =
				(options.userImageProxy?.scheme || "user-image") + ":";
			if (csp.has("img-src")) {
				const values = csp.get("img-src") || [];
				if (!values.includes(userImageScheme)) {
					values.push(userImageScheme);
				}
				csp.set("img-src", values);
			} else {
				csp.set("img-src", ["'self'", userImageScheme]);
			}

			callback({
				responseHeaders: {
					...details.responseHeaders,
					"content-security-policy": Array.from(csp.entries())
						.map(([k, v]) => `${k} ${v.join(" ")}`)
						.join("; "),
				},
			});
		});
	});
}

/**
 * Sets up IPC bridges in the main process.
 */
function setupBridges(
	ctx: {
		$fetch: BetterFetch;
		$store: ClientStore | null;
		getCookie: () => string;
		getWindow: () => electron.BrowserWindow | null | undefined;
	},
	opts: ElectronClientOptions,
	clientOptions: BetterAuthClientOptions | undefined,
) {
	const prefix = getChannelPrefixWithDelimiter(opts.channelPrefix);

	ctx.$store?.atoms.session?.subscribe(async (state) => {
		if (state.isPending === true) return;

		let user = state.data?.user ?? null;
		if (user !== null && typeof opts.sanitizeUser === "function") {
			try {
				user = await opts.sanitizeUser(user);
			} catch (error) {
				console.error("Error while sanitizing user", error);
				user = null;
			}
		}
		if (user !== null) {
			user = normalizeUserOutput(user, opts);
		}

		webContents.getFocusedWebContents()?.send(`${prefix}user-updated`, user);
	});

	ipcMain.handle(`${prefix}getUser`, async () => {
		const result = await ctx.$fetch<{ user: User & Record<string, any> }>(
			"/get-session",
			{
				method: "GET",
				headers: {
					cookie: ctx.getCookie(),
					"content-type": "application/json",
				},
			},
		);
		let user = result.data?.user ?? null;
		if (user !== null && typeof opts.sanitizeUser === "function") {
			try {
				user = await opts.sanitizeUser(user);
			} catch (error) {
				console.error("Error while sanitizing user", error);
				user = null;
			}
		}
		if (user !== null) {
			user = normalizeUserOutput(user, opts);
		}

		return user ?? null;
	});
	ipcMain.handle(
		`${prefix}requestAuth`,
		async (_evt, options?: ElectronRequestAuthOptions | undefined) =>
			requestAuth(clientOptions, opts, options),
	);
	ipcMain.handle(
		`${prefix}authenticate`,
		async (_evt, data: { token: string }) => {
			await authenticate({
				$fetch: ctx.$fetch,
				getWindow: ctx.getWindow,
				options: opts,
				token: data.token,
			});
		},
	);
	ipcMain.handle(`${prefix}signOut`, async () => {
		await ctx.$fetch("/sign-out", {
			method: "POST",
			body: "{}",
			headers: {
				cookie: ctx.getCookie(),
				"content-type": "application/json",
			},
		});
	});
}

function setupUserImageProxy(
	ctx: {
		$fetch: BetterFetch;
		getCookie: () => string;
	},
	opts: ElectronClientOptions,
	clientOptions: BetterAuthClientOptions | undefined,
) {
	const hasAdminPlugin =
		clientOptions?.plugins?.some((plugin) => plugin.id === "admin") ?? false;
	const scheme = opts.userImageProxy?.scheme || "user-image";

	protocol.registerSchemesAsPrivileged([
		{
			scheme,
			privileges: {
				standard: false,
				secure: true,
				bypassCSP: true,
				stream: true,
			},
		},
	]);

	app.whenReady().then(() => {
		protocol.handle(scheme, async (request) => {
			try {
				const url = new URL(request.url);
				const userId = url.hostname;
				if (!userId) {
					return new Response(null, { status: 400 });
				}

				const headers = {
					cookie: ctx.getCookie(),
					"content-type": "application/json",
				};

				let imageUrl: string | null | undefined = null;

				// Check if the requested user is the current session user
				const sessionResult = await ctx.$fetch<{
					user: User & Record<string, any>;
				}>("/get-session", {
					method: "GET",
					headers,
				});

				if (sessionResult.data?.user?.id === userId) {
					imageUrl = sessionResult.data.user.image;
				} else if (hasAdminPlugin) {
					const userResult = await ctx.$fetch<{
						user: User & Record<string, any>;
					}>(`/admin/get-user?id=${encodeURIComponent(userId)}`, {
						method: "GET",
						headers,
					});
					imageUrl = userResult.data?.user?.image;
				}

				if (!imageUrl) {
					return new Response(null, { status: 404 });
				}

				const result = await fetchUserImage(
					clientOptions?.baseURL,
					imageUrl,
					opts,
				);
				if (!result) {
					return new Response(null, { status: 404 });
				}

				return new Response(result.stream, {
					headers: {
						"content-type": result.mimeType,
						"cache-control": "private, max-age=3600",
					},
				});
			} catch {
				return new Response(null, { status: 500 });
			}
		});
	});
}
