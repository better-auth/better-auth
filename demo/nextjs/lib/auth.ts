import { dash, sendEmail } from "@better-auth/dash";
import { oauthProvider } from "@better-auth/oauth-provider";
import { passkey } from "@better-auth/passkey";
import { scim } from "@better-auth/scim";
import { sso } from "@better-auth/sso";
import { stripe } from "@better-auth/stripe";
import { LibsqlDialect } from "@libsql/kysely-libsql";
import type { BetterAuthOptions } from "better-auth";
import { APIError, betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import type { Organization } from "better-auth/plugins";
import {
	admin,
	bearer,
	customSession,
	deviceAuthorization,
	jwt,
	lastLoginMethod,
	multiSession,
	oAuthProxy,
	oneTap,
	openAPI,
	organization,
	twoFactor,
} from "better-auth/plugins";
import { MysqlDialect } from "kysely";
import { createPool } from "mysql2/promise";
import { Stripe } from "stripe";

const _from = process.env.BETTER_AUTH_EMAIL || "delivered@resend.dev";
const _to = process.env.TEST_EMAIL || "";

const dialect = (() => {
	if (process.env.USE_MYSQL) {
		if (!process.env.MYSQL_DATABASE_URL) {
			throw new Error(
				"Using MySQL dialect without MYSQL_DATABASE_URL. Please set it in your environment variables.",
			);
		}
		return new MysqlDialect(createPool(process.env.MYSQL_DATABASE_URL || ""));
	} else {
		if (process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN) {
			return new LibsqlDialect({
				url: process.env.TURSO_DATABASE_URL,
				authToken: process.env.TURSO_AUTH_TOKEN,
			});
		}
	}
	return null;
})();

if (!dialect) {
	throw new Error("No dialect found");
}

const authOptions = {
	appName: "Better Auth Demo",
	database: {
		dialect,
		type: "sqlite",
	},
	emailVerification: {
		async sendVerificationEmail({ user, url }) {
			await sendEmail({
				to: user.email,
				subject: "Verify your email address",
				template: "verify-email",
				variables: {
					verificationUrl: url,
					userEmail: user.email,
					userName: user.name,
					appName: "Better Auth Demo",
					expirationMinutes: "10",
					verificationCode: "",
				},
			});
		},
	},
	account: {
		accountLinking: {
			trustedProviders: ["google", "github", "demo-app", "sso"],
		},
	},
	emailAndPassword: {
		enabled: true,
		async sendResetPassword({ user, url }) {
			await sendEmail({
				to: user.email,
				subject: "Reset your password",
				template: "reset-password",
				variables: {
					userEmail: user.email,
					resetLink: url,
					userName: user.name,
				},
			});
		},
	},
	socialProviders: {
		facebook: {
			clientId: process.env.FACEBOOK_CLIENT_ID || "",
			clientSecret: process.env.FACEBOOK_CLIENT_SECRET || "",
		},
		github: {
			clientId: process.env.GITHUB_CLIENT_ID || "",
			clientSecret: process.env.GITHUB_CLIENT_SECRET || "",
		},
		google: {
			clientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "",
			clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
		},
		discord: {
			clientId: process.env.DISCORD_CLIENT_ID || "",
			clientSecret: process.env.DISCORD_CLIENT_SECRET || "",
		},
		microsoft: {
			clientId: process.env.MICROSOFT_CLIENT_ID || "",
			clientSecret: process.env.MICROSOFT_CLIENT_SECRET || "",
		},
		twitch: {
			clientId: process.env.TWITCH_CLIENT_ID || "",
			clientSecret: process.env.TWITCH_CLIENT_SECRET || "",
		},
		twitter: {
			clientId: process.env.TWITTER_CLIENT_ID || "",
			clientSecret: process.env.TWITTER_CLIENT_SECRET || "",
		},
		paypal: {
			clientId: process.env.PAYPAL_CLIENT_ID || "",
			clientSecret: process.env.PAYPAL_CLIENT_SECRET || "",
		},
		vercel: {
			clientId: process.env.VERCEL_CLIENT_ID || "",
			clientSecret: process.env.VERCEL_CLIENT_SECRET || "",
		},
	},
	plugins: [
		organization({
			async sendInvitationEmail(data) {
				sendEmail({
					to: data.email,
					subject: "You've been invited to join an organization",
					template: "invitation",
					variables: {
						inviterEmail: data.inviter.user.email,
						inviterName: data.inviter.user.name,
						organizationName: data.organization.name,
						role: data.role,
						inviteLink:
							process.env.NODE_ENV === "development"
								? `http://localhost:3000/accept-invitation/${data.id}`
								: `${process.env.BETTER_AUTH_URL || "https://demo.better-auth.com"}/accept-invitation/${data.id}`,
					},
				});
			},
		}),
		twoFactor({
			otpOptions: {
				async sendOTP({ user, otp }) {
					await sendEmail({
						to: user.email,
						subject: "Your two-factor authentication code",
						template: "two-factor",
						variables: {
							otpCode: otp,
							userEmail: user.email,
							userName: user.name,
							appName: "Better Auth Demo",
						},
					});
				},
			},
		}),
		passkey(),
		openAPI(),
		bearer(),
		admin(),
		multiSession(),
		oAuthProxy({
			productionURL:
				process.env.BETTER_AUTH_URL || "https://demo.better-auth.com",
		}),
		nextCookies(),
		oneTap(),
		stripe({
			stripeClient: new Stripe(process.env.STRIPE_KEY || "sk_test_"),
			stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
			subscription: {
				enabled: true,
				allowReTrialsForDifferentPlans: true,
				plans: () => {
					const PRO_PRICE_ID = {
						default:
							process.env.STRIPE_PRO_PRICE_ID ??
							"price_1RoxnRHmTADgihIt4y8c0lVE",
						annual:
							process.env.STRIPE_PRO_ANNUAL_PRICE_ID ??
							"price_1RoxnoHmTADgihItzFvVP8KT",
					};
					const PLUS_PRICE_ID = {
						default:
							process.env.STRIPE_PLUS_PRICE_ID ??
							"price_1RoxnJHmTADgihIthZTLmrPn",
						annual:
							process.env.STRIPE_PLUS_ANNUAL_PRICE_ID ??
							"price_1Roxo5HmTADgihItEbJu5llL",
					};

					return [
						{
							name: "Plus",
							priceId: PLUS_PRICE_ID.default,
							annualDiscountPriceId: PLUS_PRICE_ID.annual,
							freeTrial: {
								days: 7,
							},
						},
						{
							name: "Pro",
							priceId: PRO_PRICE_ID.default,
							annualDiscountPriceId: PRO_PRICE_ID.annual,
							freeTrial: {
								days: 7,
							},
						},
					];
				},
			},
		}),
		sso({
			defaultSSO: [
				{
					domain: "http://localhost:3000",
					providerId: "sso",
					samlConfig: {
						issuer: "http://localhost:3000/api/auth/sso/saml2/sp/metadata",
						entryPoint:
							"https://dummyidp.com/apps/app_01k16v4vb5yytywqjjvv2b3435",
						cert: `-----BEGIN CERTIFICATE-----
	  MIIDBzCCAe+gAwIBAgIUCLBK4f75EXEe4gyroYnVaqLoSp4wDQYJKoZIhvcNAQEL
	  BQAwEzERMA8GA1UEAwwIZHVtbXlpZHAwHhcNMjQwNTEzMjE1NDE2WhcNMzQwNTEx
	  MjE1NDE2WjATMREwDwYDVQQDDAhkdW1teWlkcDCCASIwDQYJKoZIhvcNAQEBBQAD
	  ggEPADCCAQoCggEBAKhmgQmWb8NvGhz952XY4SlJlpWIK72RilhOZS9frDYhqWVJ
	  HsGH9Z7sSzrM/0+YvCyEWuZV9gpMeIaHZxEPDqW3RJ7KG51fn/s/qFvwctf+CZDj
	  yfGDzYs+XIgf7p56U48EmYeWpB/aUW64gSbnPqrtWmVFBisOfIx5aY3NubtTsn+g
	  0XbdX0L57+NgSvPQHXh/GPXA7xCIWm54G5kqjozxbKEFA0DS3yb6oHRQWHqIAM/7
	  mJMdUVZNIV1q7c2JIgAl23uDWq+2KTE2R5liP/KjvjwKonVKtTqGqX6ei25rsTHO
	  aDpBH/LdQK2txgsm7R7+IThWNvUI0TttrmwBqyMCAwEAAaNTMFEwHQYDVR0OBBYE
	  FD142gxIAJMhpgMkgpzmRNoW9XbEMB8GA1UdIwQYMBaAFD142gxIAJMhpgMkgpzm
	  RNoW9XbEMA8GA1UdEwEB/wQFMAMBAf8wDQYJKoZIhvcNAQELBQADggEBADQd6k6z
	  FIc20GfGHY5C2MFwyGOmP5/UG/JiTq7Zky28G6D0NA0je+GztzXx7VYDfCfHxLcm
	  2k5t9nYhb9kVawiLUUDVF6s+yZUXA4gUA3KoTWh1/oRxR3ggW7dKYm9fsNOdQAbx
	  UUkzp7HLZ45ZlpKUS0hO7es+fPyF5KVw0g0SrtQWwWucnQMAQE9m+B0aOf+92y7J
	  QkdgdR8Gd/XZ4NZfoOnKV7A1utT4rWxYCgICeRTHx9tly5OhPW4hQr5qOpngcsJ9
	  vhr86IjznQXhfj3hql5lA3VbHW04ro37ROIkh2bShDq5dwJJHpYCGrF3MQv8S3m+
	  jzGhYL6m9gFTm/8=
	  -----END CERTIFICATE-----`,
						spMetadata: {
							metadata: `
				  <md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" entityID="http://localhost:3000/api/auth/sso/saml2/sp/metadata">
		  <md:SPSSODescriptor AuthnRequestsSigned="false" WantAssertionsSigned="false" protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
			  <md:KeyDescriptor use="signing">
			  <ds:KeyInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
				  <ds:X509Data>
				  <ds:X509Certificate>MIIE3jCCAsYCCQDE5FzoAkixzzANBgkqhkiG9w0BAQsFADAxMQswCQYDVQQGEwJVUzEQMA4GA1UECAwHRmxvcmlkYTEQMA4GA1UEBwwHT3JsYW5kbzAeFw0yMzExMTkxMjUyMTVaFw0zMzExMTYxMjUyMTVaMDExCzAJBgNVBAYTAlVTMRAwDgYDVQQIDAdGbG9yaWRhMRAwDgYDVQQHDAdPcmxhbmRvMIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEA2ELJsLZs4yBH7a2U5pA7xw+Oiut7b/ROKh2BqSTKRbEG4xy7WwljT02Mh7GTjLvswtZSUObWFO5v14HNORa3+J9JT2DH+9F+FJ770HX8a3cKYBNQt3xP4IeUyjI3QWzrGtkYPwSZ74tDpAUtuqPAxtoCaZXFDtX6lvCJDqiPnfxRZrKkepYWINSwu4DRpg6KoiPWRCYTsEcCzImInzlACdM97jpG1gLGA6a4dmjalQbRtvC56N0Z56gIhYq2F5JdzB2a10pqoIY8ggXZGIJS9I++8mmdTj6So5pPxLwnCYUhwDew1/DMbi9xIwYozs9pEtHCTn1l34jldDwTziVAxGQZO7QUuoMl997zqcPS7pVWRnfz5odKuytLvQDA0lRVfzOxtqbM3qVhoLT2iDmnuEtlZzgfbt4WEuT2538qxZJkFRpZQIrTj3ybqmWAv36Cp49dfeMwaqjhfX7/mVfbsPMSC653DSZBB+n+Uz0FC3QhH+vIdNhXNAQ5tBseHUR6pXiMnLtI/WVbMvpvFwK2faFTcx1oaP/Qk6yCq66tJvPbnatT9qGF8rdBJmAk9aBdQTI+hAh5mDtDweCrgVL+Tm/+Q85hSl4HGzH/LhLVS478tZVX+o+0yorZ35LCW3e4v8iX+1VEGSdg2ooOWtbSSXK2cYZr8ilyUQp0KueenR0CAwEAATANBgkqhkiG9w0BAQsFAAOCAgEAsonAahruWuHlYbDNQVD0ryhL/b+ttKKqVeT87XYDkvVhlSSSVAKcCwK/UU6z8Ty9dODUkd93Qsbof8fGMlXeYCtDHMRanvWLtk4wVkAMyNkDYHzJ1FbO7v44ZBbqNzSLy2kosbRELlcz+P3/42xumlDqAw/k13tWUdlLDxb0pd8R5yBev6HkIdJBIWtKmUuI+e8F/yTNf5kY7HO1p0NeKdVeZw4Ydw33+BwVxVNmhIxzdP5ZFQv0XRFWhCMo/6RLEepCvWUp/T1WRFqgwAdURaQrvvfpjO/Ls+neht1SWDeP8RRgsDrXIc3gZfaD8q4liIDTZ6HsFi7FmLbZatU8jJ4pCstxQLCvmix+1zF6Fwa9V5OApSTbVqBOsDZbJxeAoSzy5Wx28wufAZT4Kc/OaViXPV5o/ordPs4EYKgd/eNFCgIsZYXe75rYXqnieAIfJEGddsLBpqlgLkwvf5KVS4QNqqX+2YubP63y+3sICq2ScdhO3LZs3nlqQ/SgMiJnCBbDUDZ9GGgJNJVVytcSz5IDQHeflrq/zTt1c4q1DO3CS7mimAnTCjetERRQ3mgY/2hRiuCDFj3Cy7QMjFs3vBsbWrjNWlqyveFmHDRkq34Om7eA2jl3LZ5u7vSm0/ylp/vtoysMjwEmw/0NA3hZPTG3OJxcvFcXBsz0SiFcd1U=</ds:X509Certificate>
				  </ds:X509Data>
			  </ds:KeyInfo>
			  </md:KeyDescriptor>
			  <md:KeyDescriptor use="encryption">
			  <ds:KeyInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
				  <ds:X509Data>
				  <ds:X509Certificate>MIIE3jCCAsYCCQDE5FzoAkixzzANBgkqhkiG9w0BAQsFADAxMQswCQYDVQQGEwJVUzEQMA4GA1UECAwHRmxvcmlkYTEQMA4GA1UEBwwHT3JsYW5kbzAeFw0yMzExMTkxMjUyMTVaFw0zMzExMTYxMjUyMTVaMDExCzAJBgNVBAYTAlVTMRAwDgYDVQQIDAdGbG9yaWRhMRAwDgYDVQQHDAdPcmxhbmRvMIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEA2ELJsLZs4yBH7a2U5pA7xw+Oiut7b/ROKh2BqSTKRbEG4xy7WwljT02Mh7GTjLvswtZSUObWFO5v14HNORa3+J9JT2DH+9F+FJ770HX8a3cKYBNQt3xP4IeUyjI3QWzrGtkYPwSZ74tDpAUtuqPAxtoCaZXFDtX6lvCJDqiPnfxRZrKkepYWINSwu4DRpg6KoiPWRCYTsEcCzImInzlACdM97jpG1gLGA6a4dmjalQbRtvC56N0Z56gIhYq2F5JdzB2a10pqoIY8ggXZGIJS9I++8mmdTj6So5pPxLwnCYUhwDew1/DMbi9xIwYozs9pEtHCTn1l34jldDwTziVAxGQZO7QUuoMl997zqcPS7pVWRnfz5odKuytLvQDA0lRVfzOxtqbM3qVhoLT2iDmnuEtlZzgfbt4WEuT2538qxZJkFRpZQIrTj3ybqmWAv36Cp49dfeMwaqjhfX7/mVfbsPMSC653DSZBB+n+Uz0FC3QhH+vIdNhXNAQ5tBseHUR6pXiMnLtI/WVbMvpvFwK2faFTcx1oaP/Qk6yCq66tJvPbnatT9qGF8rdBJmAk9aBdQTI+hAh5mDtDweCrgVL+Tm/+Q85hSl4HGzH/LhLVS478tZVX+o+0yorZ35LCW3e4v8iX+1VEGSdg2ooOWtbSSXK2cYZr8ilyUQp0KueenR0CAwEAATANBgkqhkiG9w0BAQsFAAOCAgEAsonAahruWuHlYbDNQVD0ryhL/b+ttKKqVeT87XYDkvVhlSSSVAKcCwK/UU6z8Ty9dODUkd93Qsbof8fGMlXeYCtDHMRanvWLtk4wVkAMyNkDYHzJ1FbO7v44ZBbqNzSLy2kosbRELlcz+P3/42xumlDqAw/k13tWUdlLDxb0pd8R5yBev6HkIdJBIWtKmUuI+e8F/yTNf5kY7HO1p0NeKdVeZw4Ydw33+BwVxVNmhIxzdP5ZFQv0XRFWhCMo/6RLEepCvWUp/T1WRFqgwAdURaQrvvfpjO/Ls+neht1SWDeP8RRgsDrXIc3gZfaD8q4liIDTZ6HsFi7FmLbZatU8jJ4pCstxQLCvmix+1zF6Fwa9V5OApSTbVqBOsDZbJxeAoSzy5Wx28wufAZT4Kc/OaViXPV5o/ordPs4EYKgd/eNFCgIsZYXe75rYXqnieAIfJEGddsLBpqlgLkwvf5KVS4QNqqX+2YubP63y+3sICq2ScdhO3LZs3nlqQ/SgMiJnCBbDUDZ9GGgJNJVVytcSz5IDQHeflrq/zTt1c4q1DO3CS7mimAnTCjetERRQ3mgY/2hRiuCDFj3Cy7QMjFs3vBsbWrjNWlqyveFmHDRkq34Om7eA2jl3LZ5u7vSm0/ylp/vtoysMjwEmw/0NA3hZPTG3OJxcvFcXBsz0SiFcd1U=</ds:X509Certificate>
				  </ds:X509Data>
			  </ds:KeyInfo>
			  </md:KeyDescriptor>
			  <md:SingleLogoutService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="http://localhost:3000/api/auth/sso/saml2/sp/sls"/>
			  <md:NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</md:NameIDFormat>
			  <md:AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="http://localhost:3000/api/auth/sso/saml2/sp/acs/sso" index="1"/>
			  <md:AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="http://localhost:3000/api/auth/sso/saml2/sp/acs/sso" index="1"/>
			  </md:SPSSODescriptor>
		  <md:Organization>
			  <md:OrganizationName xml:lang="en-US">Organization Name</md:OrganizationName>
			  <md:OrganizationDisplayName xml:lang="en-US">Organization DisplayName</md:OrganizationDisplayName>
			  <md:OrganizationURL xml:lang="en-US">http://localhost:3000/</md:OrganizationURL>
		  </md:Organization>
		  <md:ContactPerson contactType="technical">
			  <md:GivenName>Technical Contact Name</md:GivenName>
			  <md:EmailAddress>technical_contact@gmail.com</md:EmailAddress>
		  </md:ContactPerson>
		  <md:ContactPerson contactType="support">
			  <md:GivenName>Support Contact Name</md:GivenName>
			  <md:EmailAddress>support_contact@gmail.com</md:EmailAddress>
		  </md:ContactPerson>
		  </md:EntityDescriptor>
		  `,
						},
						idpMetadata: {
							entityURL:
								"https://dummyidp.com/apps/app_01k16v4vb5yytywqjjvv2b3435/metadata",
							entityID:
								"https://dummyidp.com/apps/app_01k16v4vb5yytywqjjvv2b3435",
							redirectURL:
								"https://dummyidp.com/apps/app_01k16v4vb5yytywqjjvv2b3435/sso",
							singleSignOnService: [
								{
									Binding: "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect",
									Location:
										"https://dummyidp.com/apps/app_01k16v4vb5yytywqjjvv2b3435/sso",
								},
							],
							cert: `-----BEGIN CERTIFICATE-----
		MIIDBzCCAe+gAwIBAgIUCLBK4f75EXEe4gyroYnVaqLoSp4wDQYJKoZIhvcNAQEL
		BQAwEzERMA8GA1UEAwwIZHVtbXlpZHAwHhcNMjQwNTEzMjE1NDE2WhcNMzQwNTEx
		MjE1NDE2WjATMREwDwYDVQQDDAhkdW1teWlkcDCCASIwDQYJKoZIhvcNAQEBBQAD
		ggEPADCCAQoCggEBAKhmgQmWb8NvGhz952XY4SlJlpWIK72RilhOZS9frDYhqWVJ
		HsGH9Z7sSzrM/0+YvCyEWuZV9gpMeIaHZxEPDqW3RJ7KG51fn/s/qFvwctf+CZDj
		yfGDzYs+XIgf7p56U48EmYeWpB/aUW64gSbnPqrtWmVFBisOfIx5aY3NubtTsn+g
		0XbdX0L57+NgSvPQHXh/GPXA7xCIWm54G5kqjozxbKEFA0DS3yb6oHRQWHqIAM/7
		mJMdUVZNIV1q7c2JIgAl23uDWq+2KTE2R5liP/KjvjwKonVKtTqGqX6ei25rsTHO
		aDpBH/LdQK2txgsm7R7+IThWNvUI0TttrmwBqyMCAwEAAaNTMFEwHQYDVR0OBBYE
		FD142gxIAJMhpgMkgpzmRNoW9XbEMB8GA1UdIwQYMBaAFD142gxIAJMhpgMkgpzm
		RNoW9XbEMA8GA1UdEwEB/wQFMAMBAf8wDQYJKoZIhvcNAQELBQADggEBADQd6k6z
		FIc20GfGHY5C2MFwyGOmP5/UG/JiTq7Zky28G6D0NA0je+GztzXx7VYDfCfHxLcm
		2k5t9nYhb9kVawiLUUDVF6s+yZUXA4gUA3KoTWh1/oRxR3ggW7dKYm9fsNOdQAbx
		UUkzp7HLZ45ZlpKUS0hO7es+fPyF5KVw0g0SrtQWwWucnQMAQE9m+B0aOf+92y7J
		QkdgdR8Gd/XZ4NZfoOnKV7A1utT4rWxYCgICeRTHx9tly5OhPW4hQr5qOpngcsJ9
		vhr86IjznQXhfj3hql5lA3VbHW04ro37ROIkh2bShDq5dwJJHpYCGrF3MQv8S3m+
		jzGhYL6m9gFTm/8=
		-----END CERTIFICATE-----`,
						},
						callbackUrl: "/dashboard",
					},
				},
			],
		}),
		scim(),
		deviceAuthorization({
			expiresIn: "3min",
			interval: "5s",
		}),
		lastLoginMethod(),
		jwt({
			jwt: {
				issuer: process.env.BETTER_AUTH_URL,
			},
		}),
		oauthProvider({
			loginPage: "/sign-in",
			consentPage: "/oauth/consent",
			allowDynamicClientRegistration: true,
			allowUnauthenticatedClientRegistration: true,
			scopes: [
				"openid",
				"profile",
				"email",
				"offline_access",
				"read:organization",
			],
			validAudiences: [
				process.env.BETTER_AUTH_URL || "https://demo.better-auth.com",
				(process.env.BETTER_AUTH_URL || "https://demo.better-auth.com") +
					"/api/mcp",
			],
			selectAccount: {
				page: "/oauth/select-account",
				shouldRedirect: async ({ headers }) => {
					const allSessions = await getAllDeviceSessions(headers);
					return allSessions?.length >= 1;
				},
			},
			customAccessTokenClaims({ referenceId, scopes }) {
				if (referenceId && scopes.includes("read:organization")) {
					const baseUrl =
						process.env.BETTER_AUTH_URL || "https://demo.better-auth.com";
					return {
						[`${baseUrl}/org`]: referenceId,
					};
				}
				return {};
			},
			postLogin: {
				page: "/oauth/select-organization",
				async shouldRedirect({ session, scopes, headers }) {
					const userOnlyScopes = [
						"openid",
						"profile",
						"email",
						"offline_access",
					];
					if (scopes.every((sc) => userOnlyScopes.includes(sc))) {
						return false;
					}
					// Check if user has multiple organizations to select from
					try {
						const organizations = (await getAllUserOrganizations(
							headers,
						)) as Organization[];
						return (
							organizations.length > 1 ||
							!(
								organizations.length === 1 &&
								organizations.at(0)?.id === session.activeOrganizationId
							)
						);
					} catch {
						return true;
					}
				},
				consentReferenceId({ session, scopes }) {
					if (scopes.includes("read:organization")) {
						const activeOrganizationId = (session?.activeOrganizationId ??
							undefined) as string | undefined;
						if (!activeOrganizationId) {
							throw new APIError("BAD_REQUEST", {
								error: "set_organization",
								error_description: "must set organization for these scopes",
							});
						}
						return activeOrganizationId;
					} else {
						return undefined;
					}
				},
			},
			silenceWarnings: {
				openidConfig: true,
				oauthAuthServerConfig: true,
			},
		}),
	],
	trustedOrigins: [
		"https://*.better-auth.com",
		"https://better-auth-demo-*-better-auth.vercel.app",
		"exp://",
		"https://appleid.apple.com",
	],
} satisfies BetterAuthOptions;

export const auth = betterAuth({
	...authOptions,
	plugins: [
		...(authOptions.plugins ?? []),
		customSession(
			async ({ user, session }) => {
				return {
					user: {
						...user,
						customField: "customField",
					},
					session,
				};
			},
			authOptions,
			{ shouldMutateListDeviceSessionsEndpoint: true },
		),
		dash(),
	],
});

export type Session = typeof auth.$Infer.Session;
export type ActiveOrganization = typeof auth.$Infer.ActiveOrganization;
export type OrganizationRole = ActiveOrganization["members"][number]["role"];
export type Invitation = typeof auth.$Infer.Invitation;
export type DeviceSession = Awaited<
	ReturnType<typeof auth.api.listDeviceSessions>
>[number];

async function getAllDeviceSessions(headers: Headers): Promise<unknown[]> {
	return await auth.api.listDeviceSessions({
		headers,
	});
}

async function getAllUserOrganizations(headers: Headers): Promise<unknown[]> {
	return await auth.api.listOrganizations({
		headers,
	});
}
