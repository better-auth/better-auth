
import { describe, it, expect, vi, afterEach } from 'vitest'
import { createAuthClient } from "./vanilla";

describe("client translation", () => {
    it("should translate error messages", async () => {
        const client = createAuthClient({
            baseURL: "http://localhost:3000",
            translations: {
                USER_NOT_FOUND: "用户找不到",
                INVALID_PASSWORD: "密码不正确",
            },
            fetchOptions: {
                customFetchImpl: async () => {
                    return Response.json({
                        code: "USER_NOT_FOUND",
                        message: "User not found"
                    }, {
                        status: 400,
                        headers: { "Content-Type": "application/json" }
                    })
                },
            }
        });

        const { error } = await client.signIn.email({
            email: "test@example.com",
            password: "password"
        });

        expect(error?.message).toBe("用户找不到");
    });
});
