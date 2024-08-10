import { describe, expect, it, beforeAll, afterAll } from "bun:test"
import { betterAuth } from "../../auth"
import { github, google } from "../../provider"
import { Plugin } from "../../types/plugins"
import { createAuthEndpoint } from "../call"
import { z } from "zod"
import { createClient } from "../../client"
import { Server } from "bun"


const plugin = {
    id: "test",
    endpoints: {
        test: createAuthEndpoint("/test", {
            method: "POST",
            body: z.object({
                provider: z.string()
            })
        }, async (c) => {
            return {
                url: "https://example.com"
            }
        })
    }
} satisfies Plugin

describe("signIn", async () => {
    const auth = betterAuth({
        providers: [github({
            clientId: "test",
            clientSecret: "test"
        }), google({
            clientId: "test",
            clientSecret: "test"
        })],
        plugins: [plugin]
    })
    let server: Server

    beforeAll(async () => {
        server = Bun.serve({
            fetch: async (req) => {
                try {
                    const res = await auth.handler(req)
                    return res
                } catch (e) {
                    return new Response(null, {
                        status: 500
                    })
                }
            }
        })
    })

    afterAll(() => {
        server.stop()
    })
    const client = createClient()
    it("should return a url and redirect flag", async () => {
        const res = await auth.api.signInOAuth({
            body: {
                provider: "github"
            }
        })
        expect(res).toMatchObject({
            url: expect.any(String),
            redirect: true,
            state: expect.any(String),
            codeVerifier: expect.any(String)
        })
    })


    it("should work with a client", async () => {
        const res = await client("/signIn/oAuth", {
            body: {
                provider: "github"
            }
        })
        const res2 = await client("/callback/:id", {
            params: {
                id: "github"
            },
            onResponse(context) {
                console.log(context.response.headers.get("Location"))
            },
        })
        console.log(res2)
    })
})