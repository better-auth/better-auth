import type { BetterAuthClientPlugin } from "../../client/types";

interface DeviceInfo {
  userAgent?: string;
  screenResolution?: string;
  timezone?: string;
  language?: string;
  platform?: string;
  cookiesEnabled?: boolean;
  doNotTrack?: boolean;
  hardwareConcurrency?: number;
  maxTouchPoints?: number;
  colorDepth?: number;
  pixelRatio?: number;
  canvas?: string;
  webgl?: string;
}

// Enhanced device fingerprinting for browsers with canvas and WebGL
function generateDeviceInfo(): DeviceInfo {
  const deviceInfo: DeviceInfo = {
    userAgent: navigator.userAgent,
    screenResolution: `${screen.width}x${screen.height}`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    language: navigator.language,
    platform: navigator.platform,
    cookiesEnabled: navigator.cookieEnabled,
    doNotTrack:
      navigator.doNotTrack ||
      (window as any).doNotTrack ||
      (navigator as any).msDoNotTrack,
    hardwareConcurrency: navigator.hardwareConcurrency,
    maxTouchPoints: navigator.maxTouchPoints,
    colorDepth: screen.colorDepth,
    pixelRatio: window.devicePixelRatio,
  };

  return deviceInfo;
}

export const deviceBindingClient = (options?: {
  /**
   * Auto-register device on successful login (disabled by default for strict mode)
   * @default false
   */
  autoRegisterDevice?: boolean;
  /**
   * Callback when device verification is required
   */
  onDeviceVerificationRequired?: (data: {
    isFirstDevice?: boolean;
    isNewDevice?: boolean;
    deviceId?: string;
    message?: string;
  }) => void | Promise<void>;
  /**
   * Callback when OTP is required
   */
  onOTPRequired?: (data: {
    deviceId: string;
    expiresIn: number;
    message: string;
  }) => void | Promise<void>;
  /**
   * Custom device info generator
   */
  generateDeviceInfo?: () => DeviceInfo;
  /**
   * Enable strict mode (blocks new devices by default)
   * @default true
   */
  strictMode?: boolean;
}) => {
  const opts = {
    autoRegisterDevice: options?.autoRegisterDevice ?? false,
    strictMode: options?.strictMode ?? true,
    generateDeviceInfo: options?.generateDeviceInfo ?? generateDeviceInfo,
  };

  return {
    id: "device-binding",
    pathMethods: {
      "/device-binding/register": "POST",
      "/device-binding/trust": "POST",
      "/device-binding/list": "GET",
      "/device-binding/remove": "POST",
      "/device-binding/status": "GET",
    },
    fetchPlugins: [
      {
        id: "device-binding",
        name: "device-binding",
        hooks: {
          async onSuccess(context: any) {
            // Auto-register device on successful login (first device only)
            if (
              opts.autoRegisterDevice &&
              (context.path.includes("/sign-in") ||
                context.path.includes("/sign-up"))
            ) {
              try {
                const deviceInfo = opts.generateDeviceInfo();
                const response = await context.client.deviceBinding.register({
                  deviceInfo,
                  isFirstDevice: true,
                });

                if (
                  response.requiresVerification &&
                  options?.onDeviceVerificationRequired
                ) {
                  await options.onDeviceVerificationRequired({
                    isNewDevice: response.isNewDevice,
                    message: "Device registration required",
                  });
                }
              } catch (error) {
                console.warn("Failed to auto-register device:", error);
              }
            }

            // Handle device verification requirement
            if (context.data?.deviceVerificationRequired) {
              if (options?.onDeviceVerificationRequired) {
                await options.onDeviceVerificationRequired({
                  isFirstDevice: context.data.isFirstDevice,
                  isNewDevice: context.data.isNewDevice,
                  deviceId: context.data.deviceId,
                  message: context.data.message,
                });
              }
            }
          },

          async onError(context: any) {
            // Handle device verification errors
            if (context.responseData?.deviceVerificationRequired) {
              if (options?.onDeviceVerificationRequired) {
                await options.onDeviceVerificationRequired({
                  isFirstDevice: context.responseData.isFirstDevice,
                  isNewDevice: context.responseData.isNewDevice,
                  deviceId: context.responseData.deviceId,
                  message: context.responseData.message,
                });
              }
            }
          },
        },
      },
    ],
    atomListeners: [
      {
        matcher: (path) => path.startsWith("/device-binding/"),
        signal: "$sessionSignal",
      },
    ],
  } satisfies BetterAuthClientPlugin;
};

// Enhanced helper functions for manual device management
export const deviceBindingHelpers = {
  /**
   * Register current device (first device only in strict mode)
   */
  async registerDevice(
    client: any,
    options?: {
      deviceName?: string;
      deviceInfo?: DeviceInfo;
      isFirstDevice?: boolean;
    }
  ) {
    const deviceInfo = options?.deviceInfo ?? generateDeviceInfo();

    return await client.deviceBinding.register({
      deviceInfo,
      deviceName: options?.deviceName,
      isFirstDevice: options?.isFirstDevice,
    });
  },

  /**
   * Trust current device with 2FA
   */
  async trustDevice(
    client: any,
    deviceId: string,
    verificationCode: string,
    isTotp: boolean = true
  ) {
    return await client.deviceBinding.trust({
      deviceId,
      ...(isTotp
        ? { totpCode: verificationCode }
        : { otpCode: verificationCode }),
    });
  },

  /**
   * Get list of user's devices
   */
  async getDevices(client: any) {
    return await client.deviceBinding.list();
  },

  /**
   * Remove a device
   */
  async removeDevice(client: any, deviceId: string) {
    return await client.deviceBinding.remove({ deviceId });
  },

  /**
   * Check current device status
   */
  async checkDeviceStatus(client: any) {
    return await client.deviceBinding.status();
  },

  /**
   * Get current device fingerprint
   */
  getCurrentDeviceFingerprint(): string {
    const deviceInfo = generateDeviceInfo();
    const json = JSON.stringify(deviceInfo);
    const encoded = btoa(json)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    return encoded;
  },
};

export * from "./types";
export * from "./schema";
export { deviceBinding } from "./index";
