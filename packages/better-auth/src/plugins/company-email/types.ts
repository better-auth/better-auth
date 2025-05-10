export type CompanyEmailOptions = {
  /**
   * Time in seconds for the verification token to expire
   * @default 60 * 60 * 24 (1 day)
   */
  expiresIn?: number;
  /**
   * Disable cleanup of verification token
   * @default false
   */
  disableCleanup?: boolean;
  /**
   * List of allowed emails
   * @default []
   */
  allowedEmails?: string[];
  /**
   * Generate token function
   * @default generateRandomString(32)
   */
  generateToken?: () => Promise<string> | string;
  /**
   * Enable cookie storage after verification
   */
  storeCookieAfterVerification?: {
    /**
     * Enable cookie storage after verification
     * @default false
     */
    enabled: boolean;
    /**
     * Cookie name
     * @default "temp-verification"
     */
    cookieName?: string;
    /**
     * Cookie expiration time in seconds
     * @default 60 * 60 * 24 (1 day)
     */
    expires?: number;
  };
  /**
   * Send email verification function
   */
  sendEmailVerification: (options: {
    email: string;
    url: string;
    token: string;
  }) => Promise<void>;
};
