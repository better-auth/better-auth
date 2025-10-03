import { z } from "zod";
import type { AuthPluginSchema } from "..";

export const schema = {
  user: {
    fields: {
      deviceBindingEnabled: {
        type: "boolean",
        required: false,
        defaultValue: true,
        input: false,
      },
      hasRegisteredDevice: {
        type: "boolean",
        required: false,
        defaultValue: false,
        input: false,
      },
    },
  },
  deviceBinding: {
    fields: {
      id: {
        type: "string",
        required: true,
      },
      userId: {
        type: "string",
        required: true,
        references: {
          model: "user",
          field: "id",
        },
      },
      deviceId: {
        type: "string",
        required: true,
        unique: true,
      },
      deviceFingerprint: {
        type: "string",
        required: false,
      },
      deviceName: {
        type: "string",
        required: false,
      },
      trusted: {
        type: "boolean",
        required: true,
        defaultValue: false,
      },
      trustedAt: {
        type: "date",
        required: false,
      },
      lastSeenAt: {
        type: "date",
        required: true,
      },
      createdAt: {
        type: "date",
        required: true,
      },
      expiresAt: {
        type: "date",
        required: false,
      },
      isFirstDevice: {
        type: "boolean",
        required: false,
        defaultValue: false,
      },
    },
  },
  deviceVerificationOTP: {
    fields: {
      id: {
        type: "string",
        required: true,
      },
      userId: {
        type: "string",
        required: true,
        references: {
          model: "user",
          field: "id",
        },
      },
      deviceId: {
        type: "string",
        required: true,
      },
      otp: {
        type: "string",
        required: false,
      },
      verified: {
        type: "boolean",
        required: true,
        defaultValue: false,
      },
      attempts: {
        type: "number",
        required: true,
        defaultValue: 0,
      },
      createdAt: {
        type: "date",
        required: true,
      },
      expiresAt: {
        type: "date",
        required: true,
      },
    },
  },
} satisfies AuthPluginSchema;

export const deviceBinding = z.object({
  id: z.string(),
  userId: z.string(),
  deviceId: z.string(),
  deviceFingerprint: z.string(),
  deviceName: z.string().optional(),
  trusted: z.boolean().default(false),
  trustedAt: z.date().optional(),
  lastSeenAt: z.date(),
  createdAt: z.date(),
  expiresAt: z.date().optional(),
  isFirstDevice: z.boolean().default(false),
});

export const deviceVerificationOTP = z.object({
  id: z.string(),
  userId: z.string(),
  deviceId: z.string(),
  otp: z.string(),
  verified: z.boolean().default(false),
  attempts: z.number().default(0),
  createdAt: z.date(),
  expiresAt: z.date(),
});

export type DeviceBinding = z.infer<typeof deviceBinding>;
export type DeviceVerificationOTP = z.infer<typeof deviceVerificationOTP>;
