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
			callback({
				responseHeaders: {
					...details.responseHeaders,
					// TODO: Only append `connect-src` or allow custom config
					"content-security-policy": [
						"default-src 'self'",
						"style-src 'self' 'unsafe-inline'",
						"script-src 'self' 'unsafe-inline'",
						`connect-src 'self' ${new URL(clientOptions?.baseURL || "", "http://localhost").origin}`,
					].join("; "),
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
) {
	ipcMain.handle(`${options.namespace || "auth"}:request-auth`, () =>
		requestAuth(options),
	);
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
	protocol.registerSchemesAsPrivileged([
		{
			scheme: options.protocol.scheme,
			privileges: {
				standard: false,
				secure: true,
				corsEnabled: true,
				supportFetchAPI: true,
				...(options.protocol.privileges || {}),
			},
		},
	]);

	let hasSetupProtocolClient = false;
	if (process?.defaultApp) {
		if (process.argv.length >= 2 && typeof process.argv[1] === "string") {
			hasSetupProtocolClient = app.setAsDefaultProtocolClient(
				options.protocol.scheme,
				process.execPath,
				[resolvePath(process.argv[1])],
			);
		}
	} else {
		hasSetupProtocolClient = app.setAsDefaultProtocolClient(
			options.protocol.scheme,
		);
	}

	if (!hasSetupProtocolClient) {
		console.error(
			`Failed to register protocol ${options.protocol.scheme} as default protocol client.`,
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
		if (!url.startsWith(`${options.protocol.scheme}:/`)) {
			return;
		}
		url = url.substring(`${options.protocol.scheme}:/`.length);
		const { protocol, pathname, searchParams, hostname } = parsedURL;
		if (protocol !== `${options.protocol.scheme}:`) {
			return;
		}

		const path = "/" + hostname + pathname;
		const callbackPath = options.callbackPath?.startsWith("/") ? options.callbackPath : `/${options.callbackPath}`;

		if (path !== callbackPath) {
			return;
		}

		const token = searchParams.get("token");
		if (!token) {
			return;
		}

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

			url ??= new URL(commandLine.pop() || "").toString();
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
