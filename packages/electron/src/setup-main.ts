import type { BetterAuthClientOptions } from "@better-auth/core";
import type { BetterFetch } from "@better-fetch/fetch";
import { authenticate, requestAuth } from "./authenticate";
import type { ElectronClientOptions } from "./types";

/**
 * Sets up Content Security Policy (CSP) for the Electron application.
 *
 * @internal
 */
export function setupCSP(
	{
		app,
		session,
	}: {
		app: Electron.App;
		session: typeof Electron.Session;
	},
	clientOptions: BetterAuthClientOptions | undefined,
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

				const [rawDirectiveName, ...directiveValue] =
					token.split(/[\t\n\f\r]+/);
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

/**
 * Sets up Electron IPC handlers in the main process.
 *
 * @internal
 */
export function setupIPCMain(
	{ ipcMain }: { ipcMain: Electron.IpcMain },
	options: ElectronClientOptions,
	ctx: {
		$fetch: BetterFetch;
		getCookie: () => Promise<string>;
	},
) {
	const namespace = options.namespace || "auth";

	ipcMain.handle(`${namespace}:request-auth`, () => requestAuth(options));
	ipcMain.handle(`${namespace}:sign-out`, async () => {
		await ctx.$fetch("/sign-out", {
			method: "POST",
			headers: {
				cookie: await ctx.getCookie(),
				"content-type": "application/json",
			},
		});
	});
}

/**
 * Registers the custom protocol scheme and sets up deep link handling.
 *
 * @internal
 */
export function registerProtocolScheme(
	{ app, protocol }: { app: Electron.App; protocol: Electron.Protocol },
	$fetch: BetterFetch,
	options: ElectronClientOptions,
	{
		resolve: resolvePath,
		window: getWindow,
	}: {
		resolve: (path: string) => string;
		window: () => Electron.BrowserWindow | null | undefined;
	},
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
				[resolvePath(process.argv[1])],
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

	const handleDeepLink = async (url: string) => {
		let parsedURL: URL | null = null;
		try {
			parsedURL = new URL(url);
		} catch {}
		if (!parsedURL) {
			return;
		}
		if (!url.startsWith(`${scheme}:/`)) {
			return;
		}
		const { protocol, pathname, hostname, hash } = parsedURL;
		if (protocol !== `${scheme}:`) {
			return;
		}

		const path = "/" + hostname + pathname;
		const callbackPath = options.callbackPath?.startsWith("/")
			? options.callbackPath
			: `/${options.callbackPath}`;

		if (path !== callbackPath) {
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
			getWindow,
		);
	};

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
					if (maybeURL === "string" && maybeURL.trim() !== "") {
					  try {
							url = new URL(maybeURL).toString();
						} catch {
						  //
						}
					}
			}

			if (process?.platform !== "darwin" && typeof url === "string") {
				await handleDeepLink(url);
			}
		});

		app.on("open-url", async (_event, url) => {
			if (process?.platform === "darwin") {
				await handleDeepLink(url);
			}
		});

		app.whenReady().then(async () => {
			if (
				process?.platform !== "darwin" &&
				typeof process.argv[1] === "string"
			) {
				await handleDeepLink(process.argv[1]);
			}
		});
	}
}
