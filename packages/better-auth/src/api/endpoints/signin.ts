import { z } from "zod";
import { createAuthEndpoint } from "../call";
import { useOAuthProvider } from "../middleware";
import { generateCodeVerifier, generateState } from "oslo/oauth2"
import { APIError } from "better-call";

export const signInOAuth = createAuthEndpoint("/signIn/oAuth", {
    method: "POST",
    use: [useOAuthProvider],
    body: z.object({
        callbackURL: z.string().optional(),
    })
}, async (c) => {
    const provider = c.context.provider
    if (provider.type === "oauth2") {
        const cookie = c.authCookies
        const state = generateState()
        try {
            c.setCookie(cookie.state.name, state, cookie.state.options)
            const codeVerifier = generateCodeVerifier()
            c.setCookie(
                cookie.pkCodeVerifier.name,
                codeVerifier,
                cookie.pkCodeVerifier.options
            )
            const url = await provider.provider.createAuthorizationURL(state, codeVerifier);
            return {
                url: url.toString(),
                state,
                codeVerifier,
                redirect: true
            };
        } catch (e) {
            console.log(e)
            throw new APIError("INTERNAL_SERVER_ERROR")
        }
    }
    throw new APIError("NOT_FOUND")
})

const signInSchema = z.object({
    data: z.record(z.string(), z.any()).optional(),
    /**
     * Callback URL to redirect to after the user has signed in.
     */
    callbackURL: z.string().optional(),
});

export const signInCredential = createAuthEndpoint("/signIn/credential", {
    method: "POST",
    body: signInSchema,
}, async () => {

})