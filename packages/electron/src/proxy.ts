import { parseCookies } from "better-auth/cookies";
import type { ElectronProxyClientOptions } from "./types/client";
import type { BetterAuthClientPlugin } from "@better-auth/core";
import { parseProtocolScheme } from "./utils";

export const electronProxyClient = (options: ElectronProxyClientOptions) => {
  const opts = {
    clientID: "electron",
    cookiePrefix: "better-auth",
    callbackPath: "/auth/callback",
    ...options,
  };
  const redirectCookieName = `${opts.cookiePrefix}.${opts.clientID}`;
  const { scheme } = parseProtocolScheme(opts.protocol);

  return {
    id: "electron-proxy",
    getActions: () => {
      return {
        ensureElectronRedirect: (
          cfg?:
            | {
                /**
                 * @default 10_000
                 */
                timeout?: number | undefined;
                /**
                 * @default 100
                 */
                interval?: number | undefined;
              }
            | undefined,
        ) => {
          const timeout = cfg?.timeout || 10_000;
          const interval = cfg?.interval || 100;

          const handleRedirect = () => {
            if (typeof document === "undefined") {
              return false;
            }
            const authorizationCode = parseCookies(document.cookie).get(
              redirectCookieName,
            );
            if (!authorizationCode) {
              return false;
            }
            document.cookie = `${redirectCookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/`;

            window.location.replace(
              `${scheme}:/${opts.callbackPath}#token=${authorizationCode}`,
            );
            return true;
          };

          const start = Date.now();
          const id = setInterval(() => {
            const success = handleRedirect();
            if (success || Date.now() - start > timeout) {
              clearInterval(id);
            }
          }, interval);

          return id;
        },
      };
    },
  } satisfies BetterAuthClientPlugin;
};
