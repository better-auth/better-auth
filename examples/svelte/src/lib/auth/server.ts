import { betterAuth } from "better-auth";
import { github } from "better-auth/providers";
import { GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET } from "$env/static/private";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { db } from "$lib/db";


export const auth = betterAuth({
    providers: [
        github({
            clientId: GITHUB_CLIENT_ID,
            clientSecret: GITHUB_CLIENT_SECRET
        })
    ],
    adapter: prismaAdapter(db),
    user: {
        fields: {
            email: {
                type: "string"
            },
            emailVerified: {
                type: "boolean"
            },
            name: {
                type: "string"
            },
            image: {
                type: "string",
                required: false
            },
            password: {
                type: "string",
                returned: false,
                required: false
            }
        }
    }
})