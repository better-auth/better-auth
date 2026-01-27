import type { Storage, ElectronClientOptions } from "./types/client";
import type { BetterAuthClientPlugin, ClientStore } from "better-auth";
import { isDevelopment, isTest } from "better-auth";
import { BetterAuthError } from "@better-auth/core/error";
import { isProcessType, parseProtocolScheme } from "./utils";
import {
  getCookie,
  getSetCookie,
  hasBetterAuthCookies,
  hasSessionCookieChanged,
} from "./cookies";
import type { ElectronRequestAuthOptions } from "./authenticate";
import { requestAuth } from "./authenticate";
import electron from "electron";
import { setupMain, setupRenderer } from "./setup";
import { Buffer } from "node:buffer";
import { base64 } from "@better-auth/utils/base64";
import type { exposeBridges } from "./bridges";
import { join } from "node:path";
import * as z from "zod";
import { readFileSync, writeFileSync } from "node:fs";
const { app, safeStorage, webContents } = electron;

const getDefaultStorageProvider = (): Storage => {
  const getPath = () => {
    const { data: name } = z.string().slugify().safeParse(app.getName());

    if (!name) {
      throw new BetterAuthError(
        "Failed to construct storage file path. Please provide a custom storage provider.",
      );
    }

    return join(app.getPath("userData"), `.${name}`);
  };
  const readStorage = () => {
    const path = getPath();

    try {
      return JSON.parse(readFileSync(path, { encoding: "utf-8" }));
    } catch {}
    return null;
  };

  return {
    getItem(name: string) {
      return readStorage()?.[name] ?? null;
    },
    setItem(name: string, value: string) {
      const data = readStorage() || {};
      data[name] = value;
      writeFileSync(getPath(), JSON.stringify(data), {
        encoding: "utf-8",
      });
    },
  };
};

const storageAdapter = (storage: Storage) => {
  return {
    ...storage,
    getDecrypted: (name: string) => {
      const item = storage.getItem(name);
      if (!item) return null;
      return safeStorage.decryptString(Buffer.from(base64.decode(item)));
    },
    setEncrypted: (name: string, value: string) => {
      return storage.setItem(
        name,
        base64.encode(safeStorage.encryptString(value)),
      );
    },
  };
};

export const electronClient = (options: ElectronClientOptions) => {
  const opts = {
    storagePrefix: "better-auth",
    cookiePrefix: "better-auth",
    namespace: "better-auth",
    callbackPath: "/auth/callback",
    storage: getDefaultStorageProvider(),
    ...options,
  };

  const { scheme } = parseProtocolScheme(opts.protocol);

  let store: ClientStore | null = null;
  const cookieName = `${opts.storagePrefix}_cookie`;
  const localCacheName = `${opts.storagePrefix}_local_cache`;
  const { getDecrypted, setEncrypted } = storageAdapter(opts.storage);

  if (
    (isDevelopment() || isTest()) &&
    // At least 1 dot, no leading or trailing dot, no consecutive dots
    /^(?!\.)(?!.*\.\.)(?!.*\.$)[^.]+\.[^.]+$/.test(scheme)
  ) {
    console.warn(
      "The provided scheme does not follow the reverse domain name notation. For example: `app.example.com` -> `com.example.app`.",
    );
  }

  return {
    id: "electron",
    fetchPlugins: [
      {
        id: "electron",
        name: "Electron",
        async init(url, options) {
          if (!isProcessType("browser")) {
            throw new Error(
              "Requests must be made from the Electron main process",
            );
          }
          const storedCookie = getDecrypted(cookieName);
          const cookie = getCookie(storedCookie || "{}");
          options ||= {};
          options.credentials = "omit";
          options.headers = {
            ...options.headers,
            cookie,
            "user-agent": app.userAgentFallback,
            "electron-origin": `${scheme}:/`,
            "x-skip-oauth-proxy": "true",
          };

          if (url.endsWith("/sign-out")) {
            setEncrypted(cookieName, "{}");
            store?.atoms.session?.set({
              ...store.atoms.session.get(),
              data: null,
              error: null,
              isPending: false,
            });
            setEncrypted(localCacheName, "{}");
          }

          return {
            url,
            options,
          };
        },
        hooks: {
          onSuccess: async (context) => {
            const setCookie = context.response.headers.get("set-cookie");

            if (setCookie) {
              if (hasBetterAuthCookies(setCookie, opts.cookiePrefix)) {
                const prevCookie = getDecrypted(cookieName);
                const toSetCookie = getSetCookie(
                  setCookie || "{}",
                  prevCookie ?? undefined,
                );

                if (hasSessionCookieChanged(prevCookie, toSetCookie)) {
                  setEncrypted(cookieName, toSetCookie);
                  store?.notify("$sessionSignal");
                } else {
                  setEncrypted(cookieName, toSetCookie);
                }
              }
            }

            if (
              context.request.url.toString().includes("/get-session") &&
              !opts.disableCache
            ) {
              const data = context.data;
              setEncrypted(localCacheName, JSON.stringify(data));
            }
          },
          onError: async (context) => {
            webContents
              .getFocusedWebContents()
              ?.send(`${opts.namespace}:error`, {
                ...context.error,
                path: context.request.url,
              });
          },
        },
      },
    ],
    getActions: ($fetch, $store, clientOptions) => {
      store = $store;

      const getCookieFn = () => {
        const cookie = getDecrypted(cookieName);
        return getCookie(cookie || "{}");
      };

      return {
        /**
         * Gets the stored cookie.
         *
         * You can use this to get the cookie stored in
         * the device and use it in your fetch requests.
         *
         * @example
         * ```ts
         * const cookie = client.getCookie();
         * await fetch("https://api.example.com", {
         *   headers: {
         *    cookie,
         *   },
         * });
         * ```
         */
        getCookie: getCookieFn,
        /**
         * Initiates the authentication process.
         * Opens the system's default browser for user authentication.
         */
        requestAuth: (options?: ElectronRequestAuthOptions | undefined) =>
          requestAuth(clientOptions, opts, options),
        setupRenderer: () => setupRenderer(opts),
        setupMain: (cfg?: {
          csp?: boolean | undefined;
          bridges?: boolean | undefined;
          scheme?: boolean | undefined;
          getWindow?: () => electron.BrowserWindow | null | undefined;
        }) => setupMain($fetch, getCookieFn, opts, clientOptions, cfg),
        $Infer: {} as {
          Bridges: ReturnType<typeof exposeBridges>["$InferBridges"];
        },
      };
    },
  } satisfies BetterAuthClientPlugin;
};

export * from "./types/client";
