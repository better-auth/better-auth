import { betterFetch } from "@better-fetch/fetch";
import { type OAuthProvider, type ProviderOptions, generateCodeChallenge, validateAuthorizationCode } from "../oauth2";

/**
 * See the full documentations below:
 * https://help.salesforce.com/s/articleView?id=xcloud.remoteaccess_using_userinfo_endpoint.htm
 */
export interface SalesforceProfile extends Record<string, any> {
  /** The URL for the UserInfo endpoint, which is the same URL that was queried. */
  sub: string;
  /** User ID of the queried user. */
  user_id: string;
  /** ID of the queried user’s Salesforce org. */
  organization_id: string;
  /** Username of the queried user. */
  preferred_username: string;
  /** Experience Cloud nickname of the queried user. */
  nickname: string;
  /** Display name (full name) of the queried user. */
  name: string;
  /** Email address of the queried user. */
  email: string;
  /**
   * Indicates whether the queried user’s email was verified by clicking a link in
   * the “Welcome to Salesforce” email.
   *
   * The email_verified value is set to true when users click a link in the email
   * they receive after this scenario occurs: For example, a Salesforce admin creates
   * the user Roberta Smith. Roberta receives a "Welcome to Salesforce" email message
   * with a link to verify her account. After she clicks the link, the email_verified
   * value is set to true.
   *
   *  - They change their email address
   *  - They change their password, or a Salesforce admin resets their password
   *  - They verify their identity when logging in from a new device or browser
   *  - A Salesforce admin creates them as a new user
   *
   */
  email_verified: boolean;
  /** First name of the queried user. */
  given_name: string;
  /** Family name (last name) of the queried user. */
  family_name: string;
  /** Time zone specified in the queried user’s settings. */
  zoneinfo: string;
  /**
   * Map of URLs to the queried user’s profile pictures, specified as picture,
   * thumbnail, or profile.
   * NOTE: Accessing these URLs requires passing an access token.
   */
  photos: {
    picture: string;
    thumbnail: string;
  };
  /** Undocumented, although this is similar to photos.picture */
  profile: string
  /** Undocumented, although this is identical to photos.picture */
  picture: string
  /**
   * Address of the queried user, which can include the user’s street, city, state,
   * country, and ZIP code.
   */
  address: Record<string, any>,
  /** Mobile phone number specified in the queried user’s settings. */
  mobile_phone?: string;
  /** Queried user confirmed that the mobile phone number is valid. */
  mobile_phone_verified?: boolean;
  /**
   * Map containing various API endpoints that can be used with the queried user
   * Note Accessing the REST endpoints requires passing an access token.
   *
   * - enterprise (SOAP)
   * - metadata (SOAP)
   * - partner (SOAP)
   * - rest (REST)
   * - sobjects (REST)
   * - search (REST)
   * - query (REST)
   * - recent (REST)
   * - profile
   * - feeds (Chatter)
   * - feed-items (Chatter)
   * - groups (Chatter)
   * - users (Chatter)
   * - custom_domain
   *
   * If the org doesn’t have a custom domain configured and propagated, this value
   * is omitted.
   */
  urls: {
    enterprise: string;
    metadata: string;
    partner: string;
    rest: string;
    sobjects: string;
    search: string;
    query: string;
    recent: string;
    profile: string;
    feeds: string;
    feed_items: string;
    groups: string;
    users: string;
    custom_domain?: string;
  };
  /** Boolean specifying whether the queried user is active. */
  active: boolean;
  /** Type of the queried user (e.g., STANDARD). */
  user_type: string;
  /** Language of the queried user. */
  language: string;
  /** Locale of the queried user. */
  locale: string;
  /** Offset from UTC of the queried user’s time zone, in milliseconds. */
  utcOffset: number;
  /**
   * xsd datetime format of the last modification of the user, for example,
   * 2010-06-28T20:54:09.000Z.
   */
  updated_at: string;
  /**
   * Value is true when the connected app is installed in the user’s org, and
   * the user’s access token was created using an OAuth flow. If the connected
   * app isn’t installed, the response doesn’t contain this value. When parsing
   * the response, check for the existence and value of this property.
   */
  is_app_installed?: boolean;
  /**
   * Specific values for managing a mobile connected app. These values are available
   * only when the connected app is installed in the current user’s org, the app has
   * a defined session timeout value, and the mobile PIN has a length value defined.
   */
  mobile_policy?: {
    /**
     * screen_lock—Length of time to wait to lock the screen after inactivity.
     */
    screen_lock?: string;
    /**
     * pin_length—Length of the identification number required to gain access
     * to the mobile app.
     */
    pin_length?: string;
  };
  /**
   * Set to apple if the connected app is registered with Apple Push Notification
   * Service (APNS) for iOS push notifications. Set to androidGcm if it’s registered
   * with Google Cloud Messaging (GCM) for Android push notifications. 
   *
   * The response value type is an array.
   */
  push_service_type?: string[];
  /**
   * When a request includes the custom_permissions scope parameter, the response includes
   * a map containing custom permissions in the org associated with the connected app. If
   * the connected app isn’t installed in the org or has no associated custom permissions,
   * the response doesn’t contain a custom_permissions map.
   *
   * Here’s an example request.
   * ```
   * http://MyDomainName.my.salesforce.com/services/oauth2/authorize?response_type=token&client_
   *   id=3MVG9lKcPoNINVBKV6EgVJiF.snSDwh6_2wSS7BrOhHGEJkC_&redirect_uri=http://www.example.org/qa/security/oauth
   *   /useragent_flow_callback.jsp&scope=api%20id%20custom_permissions
   * ```
   *
   * Here’s the JSON block in the identity URL response.
   *
   * ```json
   * "custom_permissions": {
   *   "Email.View":true,
   *   "Email.Create":false,
   *   "Email.Delete":false
   * }
   */
  custom_permissions?: {
    [permission: string]: boolean; // e.g., "Email.View": true
  };
}


export interface SalesforceOptions extends ProviderOptions<SalesforceProfile> {
  prompt?: "none" | "consent" | "login" | "select_account";
  /**
   * Your salesforce Base URL for authentication. Generally, use
   * - https://login.salesforce.com for production
   * - https://test.salesforce.com for sandbox
   *
   * @default "https://login.salesforce.com"
   */
  // Using String instead of string for IDE autocompletion.
  instanceUrl?: String | 'https://login.salesforce.com' | 'https://test.salesforce.com';
  /**
   * Security -> "Proof Key for Code Exchange (PKCE)" is enabled by default
   * when you create a Salesforce External Client App. You can disable this
   * option if you've also disabled it on Salesforce.
   *
   * @default true
   */
  pkce?: boolean;
}

export const salesforce = (userOptions: SalesforceOptions) => {
  const options = {
    instanceUrl: 'https://login.salesforce.com',
    pkce: true,
    ...userOptions,
  }

  if (!options.instanceUrl?.startsWith('https://')) {
    throw new Error(`Salesforce's options.instanceURL must start with https://. Given: ${options.instanceUrl}`)
  }

  return {
    id: "salesforce",
    name: "Salesforce",
    createAuthorizationURL: async ({ state, scopes, redirectURI, codeVerifier }) => {
      const _scopes = options.disableDefaultScope ? [] : ["openid", "profile", "email"];
      options.scope && _scopes.push(...options.scope);
      scopes && _scopes.push(...scopes);

      const params = new URLSearchParams({
        scope: _scopes.join(" "),
        response_type: "code",
        client_id: options.clientId,
        redirect_uri: options.redirectURI ? options.redirectURI : redirectURI,
        state,
        prompt: options.prompt || "consent",
      });

      if (options.pkce) {
        const codeChallenge = await generateCodeChallenge(codeVerifier);
        params.set("code_challenge_method", "S256");
        params.set("code_challenge", codeChallenge);
      }

      const url = new URL(`${options.instanceUrl}/services/oauth2/authorize`);
      url.search = params.toString();

      return url;
    },
    validateAuthorizationCode: async ({ code, redirectURI, codeVerifier }) => {
      return validateAuthorizationCode({
        code,
        redirectURI: options.redirectURI || redirectURI,
        codeVerifier,
        options,
        tokenEndpoint: `${options.instanceUrl}/services/oauth2/token`,
        authentication: "post",
      });
    },
    async getUserInfo(token) {
      if (options.getUserInfo) {
        return options.getUserInfo(token);
      }
      const { data: profile, error } = await betterFetch<SalesforceProfile>(
        `${options.instanceUrl}/services/oauth2/userinfo`,
        {
          headers: {
            authorization: `Bearer ${token.accessToken}`,
          },
        },
      );

      if (error) {
        return null;
      }

      const userMap = await options.mapProfileToUser?.(profile);

      return {
        user: {
          id: profile.user_id,
          name: profile.name,
          image: profile.photos.picture,
          email: profile.email,
          emailVerified: profile.email_verified,
          ...userMap,
        },
        data: {
          ...profile,
        },
      };
    },
  } satisfies OAuthProvider<SalesforceProfile>;
};
