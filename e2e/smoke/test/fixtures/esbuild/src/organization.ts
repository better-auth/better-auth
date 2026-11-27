import { betterAuth } from "better-auth/minimal";
import { organization } from "better-auth/plugins";

export const auth = betterAuth({ plugins: [organization()] });
