
import { generateRandomString } from "../../crypto/random";
import * as z from "zod";
import { createAuthEndpoint, createAuthMiddleware } from "../../api/call";
import { sessionMiddleware } from "../../api";
import { symmetricDecrypt } from "../../crypto";
import type { BetterAuthPlugin } from "../../types/plugins";
import { mergeSchema } from "../../db/schema";
import { APIError } from "better-call";
import { deleteSessionCookie } from "../../cookies";
import { createHash } from "@better-auth/utils/hash";
import { base64Url } from "@better-auth/utils/base64";
import type { GenericEndpointContext, User } from "../../types";
import type { DeviceBindingOptions, DeviceInfo, TrustedDevice } from "./types";
import { schema, type DeviceBinding, type DeviceVerificationOTP } from "./schema";

export interface UserWithDeviceBinding extends User {
  hasRegisteredDevice: boolean;
  phoneNumberVerified: boolean;
  deviceId: string;
}

async function defaultDeviceFingerprinting(context: GenericEndpointContext): Promise<string> {
  const headers = context.headers;
  const userAgent = headers?.get("user-agent") || "";
  const acceptLanguage = headers?.get("accept-language") || "";
  const acceptEncoding = headers?.get("accept-encoding") || "";
  const xForwardedFor = headers?.get("x-forwarded-for") || "";
  const xRealIp = headers?.get("x-real-ip") || "";
  
  const deviceInfo = (context.body)?.deviceInfo as DeviceInfo || {};
  
  // Helper function to safely get values
  const safeGet = (value: any) => value !== undefined ? value : null;
  
  const fingerprintData = {
    userAgent,
    acceptLanguage,
    acceptEncoding,
    ipPrefix: (xForwardedFor || xRealIp).split('.').slice(0, 2).join('.'),
    // Core device properties (reliable on both browsers and mobile apps)
    screenResolution: safeGet(deviceInfo.screenResolution),
    timezone: safeGet(deviceInfo.timezone),
    language: safeGet(deviceInfo.language),
    platform: safeGet(deviceInfo.platform),
    deviceId: safeGet(deviceInfo.deviceId),
  };
  
  // Remove null values to normalize fingerprint
  const cleanedData = Object.fromEntries(
    Object.entries(fingerprintData).filter(([_, value]) => value !== null)
  );
  
  const fingerprintString = JSON.stringify(cleanedData);
  const hash = await createHash("SHA-256").digest(
    new TextEncoder().encode(fingerprintString)
  );
  
  return base64Url.encode(new Uint8Array(hash), { padding: false });
}

const DEVICE_BINDING_COOKIE_NAME = "better_auth_device_binding";

// Generate OTP for device verification
function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Default OTP sender (should be overridden in production)
 function defaultSendOTP(userId: string, deviceInfo: DeviceInfo): string {
  const otp = generateOTP();
  return otp;
}

// Enhanced 2FA verification
async function verify2FA(
  ctx: any,
  userId: string, 
  totpCode?: string, 
  otpCode?: string,
  options?: DeviceBindingOptions
): Promise<boolean> {
  if (totpCode && options?.verifyTOTP) {
    return await options.verifyTOTP(userId, totpCode);
  }
  
  if (otpCode && options?.verifyOTP) {
    return await options.verifyOTP(userId, otpCode);
  }
  
  // Fallback: Check against two-factor plugin
  if (totpCode) {
    try {
      const twoFactor = await ctx.context.adapter.findOne({
        model: "twoFactor",
        where: [{ field: "userId", value: userId }],
      });
      
      if (!twoFactor) {
        throw new APIError("BAD_REQUEST", { message: "2FA not enabled" });
      }
      
      const decryptedSecret = await symmetricDecrypt({
        key: ctx.context.secret,
        data: twoFactor.secret,
      });
      
      const { createOTP } = await import("@better-auth/utils/otp");
      const otp = createOTP(decryptedSecret);
      return otp.verify(totpCode);
    } catch (error) {
      console.error("2FA verification failed:", error);
      return false;
    }
  }
  
  return false;
}

export const deviceBinding = (options?: DeviceBindingOptions) => {
  const opts = {
    trustDuration: options?.trustDuration || 30,
    maxTrustedDevices: options?.maxTrustedDevices || 3,
    requireDeviceVerification: options?.requireDeviceVerification ?? true,
    generateDeviceFingerprint: options?.generateDeviceFingerprint || defaultDeviceFingerprinting,
    autoRegisterDevice: options?.autoRegisterDevice ?? false,
    strictMode: options?.strictMode ?? true,
    deviceBindingTable: options?.deviceBindingTable || "deviceBinding",
    otpTable: options?.otpTable || "deviceVerificationOTP",
    sendOTP: options?.sendOTP || defaultSendOTP,
  };

  return {
    id: "device-binding",
    endpoints: {
      /**
       * Register a new device (only for first-time users in strict mode)
       */
      registerDeviceWithOTP: createAuthEndpoint(
        "/device-binding/register",
        {
          method: "POST",
          body: z.object({
            email: z.email(),
            deviceInfo: z.object({
              userAgent: z.string().optional(),
              screenResolution: z.string().optional(),
              timezone: z.string().optional(),
              language: z.string().optional(),
              platform: z.string().optional(),
              deviceId: z.string().optional(),
            }).optional(),
            step: z.enum(["request", "verify"]),
            otp: z.string().optional(),
            deviceName: z.string().optional(),
            trustDevice: z.boolean().optional(),
          }),
          metadata: {
            openapi: {
              summary: "Quick device registration with OTP",
              description: "Register device using email OTP verification (unprotected)",
            },
          },
        },
        async (ctx) => {
          const { email, deviceInfo, step, otp, deviceName, trustDevice } = ctx.body;
          
          // Find user
          const user = await ctx.context.adapter.findOne<User>({
            model: "user",
            where: [{ field: "email", value: email }],
          });
          
          if (!user) {
            throw new APIError("NOT_FOUND", { message: "User not found" });
          }
          
          const deviceFingerprint = await opts.generateDeviceFingerprint(ctx);
          
          if (step === "request") {
            // Clean up expired OTPs
            await ctx.context.adapter.delete({
              model: opts.otpTable,
              where: [
                { field: "userId", value: user.id },
                { field: "expiresAt", value: new Date(), operator: "lt" },
              ],
            });
            
            // Generate and send OTP
            const deviceId = generateRandomString(32);
            const otpCode = await opts.sendOTP(user.id, deviceInfo || {});
            
            // Store OTP
            const hashedOTP = await createHash("SHA-256").digest(new TextEncoder().encode(otpCode));
            await ctx.context.adapter.create({
              model: opts.otpTable,
              data: {
                id: generateRandomString(32),
                userId: user.id,
                deviceId,
                otp: base64Url.encode(new Uint8Array(hashedOTP)),
                verified: false,
                attempts: 0,
                createdAt: new Date(),
                expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
              },
            });
            
            return ctx.json({
              success: true,
              deviceId,
              message: "OTP sent to your email",
              expiresIn: 600,
            });
          } else if (step === "verify" && otp) {
            // Verify OTP and register device
            const hashedOTP = await createHash("SHA-256").digest(new TextEncoder().encode(otp));
            const hashedOTPString = base64Url.encode(new Uint8Array(hashedOTP));
            
            const otpRecord = await ctx.context.adapter.findOne<DeviceVerificationOTP>({
              model: opts.otpTable,
              where: [
                { field: "userId", value: user.id },
                { field: "otp", value: hashedOTPString },
                { field: "verified", value: false },
              ],
            });
            
            if (!otpRecord || otpRecord.expiresAt < new Date() || otpRecord.attempts >= 5) {
              throw new APIError("BAD_REQUEST", { message: "Invalid or expired OTP" });
            }
            
            // Mark OTP as verified
            await ctx.context.adapter.update({
              model: opts.otpTable,
              where: [{ field: "id", value: otpRecord.id }],
              update: { verified: true },
            });
            
            // Check if this is the first device
            const existingDevicesCount = await ctx.context.adapter.count({
              model: opts.deviceBindingTable,
              where: [{ field: "userId", value: user.id }],
            });
            
            const isFirstDevice = existingDevicesCount === 0;
            const shouldTrust = trustDevice || isFirstDevice;
            
            // Create device
            const deviceId = generateRandomString(32);
            const newDevice = await ctx.context.adapter.create({
              model: opts.deviceBindingTable,
              data: {
                id: generateRandomString(32),
                userId: user.id,
                deviceId,
                deviceFingerprint,
                deviceName: deviceName || generateDeviceName(deviceInfo),
                trusted: shouldTrust,
                trustedAt: shouldTrust ? new Date() : null,
                lastSeenAt: new Date(),
                createdAt: new Date(),
                expiresAt: shouldTrust 
                  ? new Date(Date.now() + opts.trustDuration * 24 * 60 * 60 * 1000)
                  : null,
                isFirstDevice,
              },
            });
            
            // Update user if first device
            if (isFirstDevice) {
              await ctx.context.adapter.update({
                model: "user",
                where: [{ field: "id", value: user.id }],
                update: { hasRegisteredDevice: true },
              });
            }
            
            // Create session
            const session = await ctx.context.internalAdapter.createSession(
              user.id,
              ctx,
              false
            );
            
            // Set cookies
            if (shouldTrust) {
              await setDeviceBindingCookie(ctx, deviceId, deviceFingerprint);
            }
            
            const sessionCookie = ctx.context.createAuthCookie("better-auth.session_token");
            await ctx.setSignedCookie(
              sessionCookie.name,
              session.token,
              ctx.context.secret,
              sessionCookie.attributes
            );
            
            return ctx.json({
              success: true,
              deviceId: newDevice.deviceId,
              trusted: newDevice.trusted,
              isFirstDevice,
              user: {
                id: user.id,
                email: user.email,
                name: user.name,
              },
              session: {
                token: session.token,
                expiresAt: session.expiresAt,
              },
            });
          } else {
            throw new APIError("BAD_REQUEST", { message: "Invalid step or missing OTP" });
          }
        }
      ),

      /**
       * Trust a device (requires 2FA verification)
       */
      trustDevice: createAuthEndpoint(
        "/device-binding/trust",
        {
          method: "POST",
          body: z.object({
            deviceId: z.string(),
            totpCode: z.string().optional(),
            otpCode: z.string().optional(),
          }),
          use: [sessionMiddleware],
          metadata: {
            openapi: {
              summary: "Trust a device",
              description: "Trust a device with 2FA verification",
            },
          },
        },
        async (ctx) => {
          const user = ctx.context.session.user;
          const { deviceId, totpCode, otpCode } = ctx.body;
          
          // Verify 2FA code
          const is2FAValid = await verify2FA(ctx, user.id, totpCode, otpCode, options);
          if (!is2FAValid) {
            throw new APIError("BAD_REQUEST", {
              message: "Invalid 2FA code",
            });
          }
          
          const device = await ctx.context.adapter.findOne<DeviceBinding>({
            model: opts.deviceBindingTable,
            where: [
              { field: "userId", value: user.id },
              { field: "deviceId", value: deviceId },
            ],
          });
          
          if (!device) {
            throw new APIError("NOT_FOUND", {
              message: "Device not found",
            });
          }
          
          // Check trusted device limit
          const trustedDevicesCount = await ctx.context.adapter.count({
            model: opts.deviceBindingTable,
            where: [
              { field: "userId", value: user.id },
              { field: "trusted", value: true },
            ],
          });
          
          if (!device.trusted && trustedDevicesCount >= opts.maxTrustedDevices) {
            throw new APIError("BAD_REQUEST", {
              message: `Maximum trusted devices limit (${opts.maxTrustedDevices}) reached`,
            });
          }
          
          // Trust the device
          const updatedDevice = await ctx.context.adapter.update<DeviceBinding>({
            model: opts.deviceBindingTable,
            where: [{ field: "id", value: device.id }],
            update: {
              trusted: true,
              trustedAt: new Date(),
              expiresAt: new Date(Date.now() + opts.trustDuration * 24 * 60 * 60 * 1000),
            },
          });
          
          await setDeviceBindingCookie(ctx, deviceId, device.deviceFingerprint);
          
          return ctx.json({
            success: true,
            deviceId: updatedDevice!.deviceId,
          });
        }
      ),

      /**
       * List user's devices
       */
      listDevices: createAuthEndpoint(
        "/device-binding/list",
        {
          method: "GET",
          use: [sessionMiddleware],
          metadata: {
            openapi: {
              summary: "List user devices",
              description: "Get list of all registered devices for the user",
            },
          },
        },
        async (ctx) => {
          const user = ctx.context.session.user;
          const currentFingerprint = await opts.generateDeviceFingerprint(ctx);
          
          const devices = await ctx.context.adapter.findMany({
            model: opts.deviceBindingTable,
            where: [{ field: "userId", value: user.id }],
          });
          
          return ctx.json({
            devices: devices.map((device: any) => ({
              deviceId: device.deviceId,
              deviceName: device.deviceName,
              trusted: device.trusted,
              trustedAt: device.trustedAt,
              lastSeenAt: device.lastSeenAt,
              createdAt: device.createdAt,
              expiresAt: device.expiresAt,
              isFirstDevice: device.isFirstDevice,
              isCurrent: device.deviceFingerprint === currentFingerprint,
            })),
          });
        }
      ),

      /**
       * Remove/untrust a device
       */
      removeDevice: createAuthEndpoint(
        "/device-binding/remove",
        {
          method: "POST",
          body: z.object({
            deviceId: z.string(),
          }),
          use: [sessionMiddleware],
          metadata: {
            openapi: {
              summary: "Remove a device",
              description: "Remove a device from the user's trusted devices",
            },
          },
        },
        async (ctx) => {
          const user = ctx.context.session.user;
          const { deviceId } = ctx.body;
          
          const device = await ctx.context.adapter.findOne<DeviceBinding>({
            model: opts.deviceBindingTable,
            where: [
              { field: "userId", value: user.id },
              { field: "deviceId", value: deviceId },
            ],
          });
          
          if (!device) {
            throw new APIError("NOT_FOUND", {
              message: "Device not found",
            });
          }
          
          // Prevent removal of first device if it's the only trusted device
          if (device.isFirstDevice) {
            const trustedDevicesCount = await ctx.context.adapter.count({
              model: opts.deviceBindingTable,
              where: [
                { field: "userId", value: user.id },
                { field: "trusted", value: true },
              ],
            });
            
            if (trustedDevicesCount <= 1) {
              throw new APIError("BAD_REQUEST", {
                message: "Cannot remove the only trusted device",
              });
            }
          }
          
          await ctx.context.adapter.delete({
            model: opts.deviceBindingTable,
            where: [{ field: "id", value: device.id }],
          });
          
          return ctx.json({ success: true });
        }
      ),

      /**
       * Check if current device is trusted
       */
      checkDeviceStatus: createAuthEndpoint(
        "/device-binding/status",
        {
          method: "GET",
          use: [sessionMiddleware],
          metadata: {
            openapi: {
              summary: "Check device status",
              description: "Check if the current device is trusted",
            },
          },
        },
        async (ctx) => {
          const user = ctx.context.session.user;
          const currentFingerprint = await opts.generateDeviceFingerprint(ctx);
          
          const device = await ctx.context.adapter.findOne<DeviceBinding>({
            model: opts.deviceBindingTable,
            where: [
              { field: "userId", value: user.id },
              { field: "deviceFingerprint", value: currentFingerprint },
            ],
          });
          
          return ctx.json({
            deviceRegistered: !!device,
            trusted: device?.trusted || false,
            deviceId: device?.deviceId || null,
            expiresAt: device?.expiresAt || null,
            isFirstDevice: device?.isFirstDevice || false,
          });
        }
      ),
    },
    
    hooks: {
      after: [
        {
          matcher(context) {
            return (
              context.path === "/sign-in/email" ||
              context.path === "/sign-in/username" ||
              context.path === "/sign-in/phone-number" ||
              context.path === "/sign-up/email" ||
              context.path === "/sign-up/username" ||
              context.path === "/sign-up/phone-number"
            );
          },
          handler: createAuthMiddleware(async (ctx) => {
            const data = ctx.context.newSession;
            if (!data || !data.user.deviceBindingEnabled) {
              return;
            }
            
            // Generate current device fingerprint
            const currentFingerprint = await opts.generateDeviceFingerprint(ctx);
            
            // Check for device binding cookie
            const deviceBindingCookieName = ctx.context.createAuthCookie(
              DEVICE_BINDING_COOKIE_NAME
            );
            const deviceBindingCookie = await ctx.getSignedCookie(
              deviceBindingCookieName.name,
              ctx.context.secret
            );
            
            let trustedDevice = null;
            
            // Check cookie-based trust first
            if (deviceBindingCookie) {
              const [deviceId, fingerprint] = deviceBindingCookie.split("!");
              
              if (fingerprint === currentFingerprint) {
                trustedDevice = await ctx.context.adapter.findOne<DeviceBinding>({
                  model: opts.deviceBindingTable,
                  where: [
                    { field: "userId", value: data.user.id },
                    { field: "deviceId", value: deviceId },
                    { field: "deviceFingerprint", value: fingerprint },
                    { field: "trusted", value: true },
                  ],
                });
                
                // Check expiration
                if (trustedDevice && trustedDevice.expiresAt && new Date() > new Date(trustedDevice.expiresAt)) {
                  trustedDevice = null;
                  // Clear expired cookie
                  await ctx.setCookie(deviceBindingCookieName.name, "", { maxAge: 0 });
                }
              }
            }
            
            // Fallback: Check fingerprint-based trust
            if (!trustedDevice) {
              trustedDevice = await ctx.context.adapter.findOne<DeviceBinding>({
                model: opts.deviceBindingTable,
                where: [
                  { field: "userId", value: data.user.id },
                  { field: "deviceFingerprint", value: currentFingerprint },
                  { field: "trusted", value: true },
                ],
              });
              
              // Check expiration
              if (trustedDevice && trustedDevice.expiresAt && new Date() > new Date(trustedDevice.expiresAt)) {
                await ctx.context.adapter.update({
                  model: opts.deviceBindingTable,
                  where: [{ field: "id", value: trustedDevice.id }],
                  update: { trusted: false, trustedAt: null, expiresAt: null },
                });
                trustedDevice = null;
              }
            }
            
            // Check if user has any registered devices
            const userDevicesCount = await ctx.context.adapter.count({
              model: opts.deviceBindingTable,
              where: [{ field: "userId", value: data.user.id }],
            });
            
            // Handle first-time users (no devices registered)
            if (userDevicesCount === 0) {
              if (opts.autoRegisterDevice || !opts.strictMode) {
                try {
                  const deviceId = generateRandomString(32);
                  await ctx.context.adapter.create({
                    model: opts.deviceBindingTable,
                    data: {
                      id: generateRandomString(32),
                      userId: data.user.id,
                      deviceId,
                      deviceFingerprint: currentFingerprint,
                      deviceName: generateDeviceName(),
                      trusted: true, // First device is auto-trusted
                      trustedAt: new Date(),
                      lastSeenAt: new Date(),
                      createdAt: new Date(),
                      expiresAt: new Date(Date.now() + opts.trustDuration * 24 * 60 * 60 * 1000),
                      isFirstDevice: true,
                    },
                  });
                  
                  await ctx.context.adapter.update({
                    model: "user",
                    where: [{ field: "id", value: data.user.id }],
                    update: { hasRegisteredDevice: true },
                  });
                  
                  await setDeviceBindingCookie(ctx, deviceId, currentFingerprint);
                  return; // Allow login
                } catch (error) {
                  console.warn("Failed to auto-register first device:", error);
                }
              }
              
              deleteSessionCookie(ctx, true);
              await ctx.context.internalAdapter.deleteSession(data.session.token);
              
              return ctx.json({
                deviceVerificationRequired: true,
                isFirstDevice: true,
                message: "Please register your first device",
              });
            }
            
            // Handle existing users with trusted device
            if (trustedDevice) {
              // Update last seen and refresh expiration
              await ctx.context.adapter.update({
                model: opts.deviceBindingTable,
                where: [{ field: "id", value: trustedDevice.id }],
                update: {
                  lastSeenAt: new Date(),
                  expiresAt: new Date(Date.now() + opts.trustDuration * 24 * 60 * 60 * 1000),
                },
              });
              
              await setDeviceBindingCookie(ctx, trustedDevice.deviceId, trustedDevice.deviceFingerprint);
              return; // Allow login
            }
            
            // Handle existing users on untrusted device
            const existingDevice = await ctx.context.adapter.findOne<DeviceBinding>({
              model: opts.deviceBindingTable,
              where: [
                { field: "userId", value: data.user.id },
                { field: "deviceFingerprint", value: currentFingerprint },
              ],
            });
            
            if (existingDevice && !existingDevice.trusted) {
              await ctx.context.adapter.update({
                model: opts.deviceBindingTable,
                where: [{ field: "id", value: existingDevice.id }],
                update: { lastSeenAt: new Date() },
              });
            } else if (!existingDevice && opts.autoRegisterDevice) {
              try {
                const deviceId = generateRandomString(32);
                await ctx.context.adapter.create({
                  model: opts.deviceBindingTable,
                  data: {
                    id: generateRandomString(32),
                    userId: data.user.id,
                    deviceId,
                    deviceFingerprint: currentFingerprint,
                    deviceName: generateDeviceName(),
                    trusted: false,
                    lastSeenAt: new Date(),
                    createdAt: new Date(),
                    isFirstDevice: false,
                  },
                });
              } catch (error) {
                console.warn("Failed to auto-register untrusted device:", error);
              }
            }
            
            // Block login on untrusted device
            if (opts.requireDeviceVerification) {
              deleteSessionCookie(ctx, true);
              await ctx.context.internalAdapter.deleteSession(data.session.token);
              
              return ctx.json({
                error: "otp_verification_required",
                deviceVerificationRequired: true,
                isNewDevice: !existingDevice,
                deviceId: existingDevice?.deviceId,
                message: "Device verification required. Please verify this device using OTP.",
              },{status: 403});
            }
          }),
        },
      ],
    },
    
    schema: mergeSchema(schema, options?.schema),
    
    rateLimit: [
      {
        pathMatcher(path) {
          return path.startsWith("/device-binding/");
        },
        window: 10,
        max: 15,
      },
      {
        pathMatcher(path) {
          return path === "/device-binding/register";
        },
        window: 60,
        max: 3,
      },
      {
        pathMatcher(path) {
          return path === "/device-binding/list" || 
                 path === "/device-binding/remove"||
                 path === "/device-binding/trust";

        },
        window: 60,
        max: 3, // Strict rate limit for unprotected registration
      },
    ],
  } satisfies BetterAuthPlugin;
};

// Helper function to set device binding cookie
async function setDeviceBindingCookie(
  ctx: any,
  deviceId: string,
  deviceFingerprint: string
) {
  const deviceBindingCookieName = ctx.context.createAuthCookie(
    DEVICE_BINDING_COOKIE_NAME,
    {
      maxAge: 30 * 24 * 60 * 60, // 30 days
      httpOnly: true,
      secure: true,
      sameSite: "lax",
    }
  );
  
  await ctx.setSignedCookie(
    deviceBindingCookieName.name,
    `${deviceId}!${deviceFingerprint}`,
    ctx.context.secret,
    deviceBindingCookieName.attributes
  );
}

function generateDeviceName(deviceInfo?: DeviceInfo): string {
  if (!deviceInfo) {
    return `Device-${Math.random().toString(36).slice(2, 8)}`;
  }
  
  const { platform, userAgent, deviceId } = deviceInfo;
  
  if (deviceId) {
    const baseName = platform?.toLowerCase().includes("android") ? "Android" :
                     platform?.toLowerCase().includes("iphone") || platform?.toLowerCase().includes("ipad") || platform?.toLowerCase().includes("ios") ? "iOS" :
                     "Device";
    return `${baseName}-${deviceId.slice(0, 8)}`;
  }
  
  if (platform) {
    if (platform.toLowerCase().includes("win")) return "Windows Device";
    if (platform.toLowerCase().includes("mac")) return "Mac Device";
    if (platform.toLowerCase().includes("linux") && userAgent?.toLowerCase().includes("android")) return "Android Device";
    if (platform.toLowerCase().includes("linux")) return "Linux Device";
    if (platform.toLowerCase().includes("iphone") || platform.toLowerCase().includes("ipad") || platform.toLowerCase().includes("ios")) return "iOS Device";
  }
  
  if (userAgent) {
    if (userAgent.includes("Chrome") && !userAgent.includes("Edge")) return "Chrome Browser";
    if (userAgent.includes("Firefox")) return "Firefox Browser";
    if (userAgent.includes("Safari") && !userAgent.includes("Chrome")) return "Safari Browser";
    if (userAgent.includes("Edge")) return "Edge Browser";
    if (userAgent.includes("Opera")) return "Opera Browser";
  }
  
  return `Device-${Math.random().toString(36).slice(2, 8)}`;
}