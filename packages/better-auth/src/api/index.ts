import { createRouter } from "better-call"
import { signInOAuth, signInCredential, callbackOAuth } from "./endpoints/"
import { BetterAuthOptions } from "../types/options"
import { getCookies } from "../utils/cookies"


export const router = (options: BetterAuthOptions) => createRouter([signInOAuth, signInCredential, callbackOAuth], {
    extraContext: {
        options,
        authCookies: getCookies(options)
    }
})