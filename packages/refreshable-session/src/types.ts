import type { CookieOptions } from "better-call";

export interface RefreshableSessionNativeClient {
	/** Public identifier sent by the native client during sign-in and refresh. */
	clientId: string;
	/**
	 * Lifetime of this client's Better Auth access session, in seconds.
	 *
	 * @default 900 (15 minutes)
	 */
	accessTokenExpiresIn?: number | undefined;
	/**
	 * Sliding inactivity lifetime of this client's refresh token, in seconds.
	 * Overrides the plugin-level `refreshTokenExpiresIn`.
	 */
	refreshTokenExpiresIn?: number | undefined;
	/**
	 * Header used to authenticate Better Auth sessions without occupying the
	 * standard Authorization header.
	 *
	 * @default "x-better-auth-session-token"
	 */
	accessTokenHeader?: string | undefined;
	/**
	 * Header carrying the refresh token during sign-out.
	 *
	 * @default "x-better-auth-refresh-token"
	 */
	refreshTokenHeader?: string | undefined;
}

export interface RefreshableSessionBrowserOptions {
	/**
	 * Issue a signed HTTP-only refresh cookie and transparently recover browser
	 * sessions during `GET /get-session`.
	 *
	 * @default false
	 */
	enabled?: boolean | undefined;
	/**
	 * Sliding inactivity lifetime of the browser refresh cookie, in seconds.
	 * Overrides the plugin-level `refreshTokenExpiresIn`.
	 */
	refreshTokenExpiresIn?: number | undefined;
	/**
	 * Override Better Auth's normal sliding session behavior. Leave this unset
	 * to preserve the application's existing web-session configuration.
	 */
	disableSessionRefresh?: boolean | undefined;
	/** Name suffix for the signed browser refresh cookie. */
	cookieName?: string | undefined;
	/** Additional attributes for the browser refresh cookie. */
	cookieAttributes?: Partial<CookieOptions> | undefined;
}

export interface RefreshableSessionOptions {
	/**
	 * Default sliding inactivity lifetime of refresh tokens, in seconds.
	 *
	 * @default 2592000 (30 days)
	 */
	refreshTokenExpiresIn?: number | undefined;
	/**
	 * Time in seconds during which a rotated token can be retried and receive
	 * the exact same successor token pair.
	 *
	 * @default 30
	 */
	refreshTokenReuseInterval?: number | undefined;
	/** Native public clients allowed to receive token response headers. */
	nativeClients?: RefreshableSessionNativeClient[] | undefined;
	/**
	 * Optional browser refresh support. Omit this option to leave existing
	 * Better Auth web sessions unchanged.
	 */
	browser?: RefreshableSessionBrowserOptions | undefined;
}

export interface RefreshableSessionRecord {
	id: string;
	tokenHash: string;
	familyId: string;
	userId: string;
	sessionId: string | null;
	clientId: string | null;
	authTime: Date;
	expiresAt: Date;
	rotatedAt: Date | null;
	revokedAt: Date | null;
	replacementRefreshToken: string | null;
	replacementSessionToken: string | null;
	replacementExpiresAt: Date | null;
	createdAt: Date;
	updatedAt: Date;
}

export interface RefreshSessionResponse {
	session: Record<string, unknown>;
	user: Record<string, unknown>;
}
