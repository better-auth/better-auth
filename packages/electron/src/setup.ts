import { resolve } from "node:path";
import type { BetterAuthClientOptions, ClientStore } from "@better-auth/core";
import { BetterAuthError } from "@better-auth/core/error";
import type { BetterFetch } from "@better-fetch/fetch";
import electron from "electron";
import { authenticate } from "./authenticate";
import { exposeBridges, setupBridges } from "./bridges";
import type { ElectronClientOptions } from "./client";
import { isProcessType, parseProtocolScheme } from "./utils";

const { app, session, protocol, BrowserWindow } = electron;

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

export function setupRenderer(opts: ElectronClientOptions) {
	if (!isProcessType("renderer")) {
		throw new BetterAuthError(
			"setupRenderer can only be called in the renderer process.",
		);
	}
	void exposeBridges(opts);
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

	if (!cfg || cfg.csp === true) {
		setupCSP(clientOptions);
	}
	if (!cfg || cfg.scheme === true) {
		registerProtocolScheme($fetch, opts, withGetWindowFallback(cfg?.getWindow));
	}
	if (!cfg || cfg.bridges === true) {
		setupBridges(
			{
				$fetch,
				$store,
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
}: {
	$fetch: BetterFetch;
	options: ElectronClientOptions;
	url: string;
	getWindow?: SetupMainConfig["getWindow"] | undefined;
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

	await authenticate(
		$fetch,
		options,
		{
			token,
		},
		withGetWindowFallback(getWindow),
	);
}

function registerProtocolScheme(
	$fetch: BetterFetch,
	options: ElectronClientOptions,
	getWindow: () => electron.BrowserWindow | null | undefined,
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
				});
			}
		});
	}
}

function setupCSP(clientOptions: BetterAuthClientOptions | undefined) {
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
