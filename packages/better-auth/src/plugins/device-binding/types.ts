// types.ts - Device binding types
export interface DeviceInfo {
  userAgent?: string;
  screenResolution?: string;
  timezone?: string;
  language?: string;
  platform?: string;
  deviceId?: string;
}

export interface DeviceBindingOptions {
  /**
   * Duration in days for how long a device remains trusted
   * @default 30
   */
  trustDuration?: number;
  /**
   * Maximum number of trusted devices per user
   * @default 3
   */
  maxTrustedDevices?: number;
  /**
   * Whether to require device verification for new devices (strict mode)
   * @default true
   */
  requireDeviceVerification?: boolean;
  /**
   * Custom device fingerprint generator
   */
  generateDeviceFingerprint?: (context: any) => Promise<string> | string;
  /**
   * Enable automatic device registration on login
   * @default false (strict mode)
   */
  autoRegisterDevice?: boolean;
  /**
   * TOTP verification function for trusting devices
   */
  verifyTOTP?: (userId: string, code: string) => Promise<boolean>;
  /**
   * OTP verification function for trusting devices
   */
  verifyOTP?: (userId: string, code: string) => Promise<boolean>;
  /**
   * Send OTP function for device verification
   */
  sendOTP?: (userId: string, deviceInfo: DeviceInfo) => Promise<string>;
  /**
   * Device binding table name
   * @default "deviceBinding"
   */
  deviceBindingTable?: string;
  /**
   * OTP table name for device verification
   * @default "deviceVerificationOTP"
   */
  otpTable?: string;
  /**
   * Block all new devices except first-time users
   * @default true
   */
  strictMode?: boolean;
  schema?: any;
}

export interface TrustedDevice {
  id: string;
  deviceId: string;
  deviceFingerprint: string;
  deviceName?: string;
  trusted: boolean;
  trustedAt?: Date;
  lastSeenAt: Date;
  createdAt: Date;
  expiresAt?: Date;
  userId: string;
  isFirstDevice?: boolean;
}
