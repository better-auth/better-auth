import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { Resource } from "sst";
import { getMongoClient } from "./db/mongodb";

const db = await getMongoClient();

export const auth = betterAuth({
    database: mongodbAdapter(db.db("better-auth-pck")),
    trustedOrigins: [
        "http://localhost:5173"
    ],
    emailAndPassword: {
        enabled: true
    },
    socialProviders: {
        google: {
            clientId: Resource.GOOGLE_CLIENT_ID.value,
            clientSecret: Resource.GOOGLE_CLIENT_SECRET.value,
        }
    },
    session: {
        expiresIn: 30 * 60,
        // cookieCache: {
        //     enabled: true,
        //     maxAge: 5 * 60, // 5 minutes
        // }
    },
    advanced: {
        cookiePrefix: "better-auth-demo",
        defaultCookieAttributes: {
            sameSite: 'none',
            secure: true,
            httpOnly: true,
            path: '/',
        }
    }
});
