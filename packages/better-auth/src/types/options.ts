import { Provider } from "../provider/types";
import { Plugin } from "./plugins";


export interface BetterAuthOptions {
    /**
     * Base path for auth instance
     * 
     * @default '/api/auth'
     */
    basePath?: string
    /**
     * list of auth providers
     */
    providers?: Provider[];
    /**
     * Plugins
     */
    plugins?: Plugin[]
    /**
     * Advanced options
     */
    advanced?: {
        /**
         * Use secure cookies
         * 
         * @default false
         */
        useSecureCookies?: boolean
    }
}