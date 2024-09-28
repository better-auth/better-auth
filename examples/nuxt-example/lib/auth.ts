import { betterAuth } from "better-auth";

export const auth = betterAuth({
    database: {
        provider: "sqlite",
        url: "./sqlite.db",
    },
    socialProviders: {
        google: {
            clientId: process.env.GOOGLE_CLIENT_ID || "",
            clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
        },
    },
    emailAndPassword: {
        enabled: true,
        async sendResetPassword(url, user) {
            console.log("Reset password url:", url);
        },
    },
});
