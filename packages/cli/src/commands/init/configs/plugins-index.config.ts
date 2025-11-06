import type { GetArgumentsOptions } from "../generate-auth";
import { type ImportGroup } from "../utility/imports";
import { twoFactorPluginConfig } from "./plugin-two-factor.config";
import { usernamePluginConfig } from "./plugin-username.config";
import { anonymousPluginConfig } from "./plugin-anonymous.config";
import { phoneNumberPluginConfig } from "./plugin-phone-number.config";
import { magicLinkPluginConfig } from "./plugin-magic-link.config";

export type Plugin = keyof typeof pluginsConfig;

export type PluginConfig = {
  displayName: string;
  auth: {
    function: string;
    imports: ImportGroup[];
    arguments?: GetArgumentsOptions[];
  };
  authClient: {
    function: string;
    imports: ImportGroup[];
    arguments?: GetArgumentsOptions[];
  } | null;
};

export type PluginsConfig = {
  [key in Plugin]: PluginConfig;
};

export const pluginsConfig = {
  twoFactor: twoFactorPluginConfig,
  username: usernamePluginConfig,
  anonymous: anonymousPluginConfig,
  phoneNumber: phoneNumberPluginConfig,
  magicLink: magicLinkPluginConfig,
} as const satisfies Record<string, PluginConfig>;
