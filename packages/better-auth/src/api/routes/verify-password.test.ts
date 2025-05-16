import { describe, expect } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { BASE_ERROR_CODES } from "../../error/codes";

describe("verify password", async (it) => {
  const { client, testUser, signInWithTestUser } = await getTestInstance({
    emailAndPassword: {
      enabled: true,
    },
  });

  it("should verify a valid password for authenticated user", async () => {
    const { headers } = await signInWithTestUser();
    
    const result = await client.verifyPassword({
      password: testUser.password,
      fetchOptions: {
        headers,
      },
    });
    
    expect(result.data?.valid).toBe(true);
  });

  it("should reject an invalid password for authenticated user", async () => {
    const { headers } = await signInWithTestUser();
    
    const result = await client.verifyPassword({
      password: "incorrect-password",
      fetchOptions: {
        headers,
      },
    });
    
    expect(result.data?.valid).toBe(false);
  });

  it("should verify a valid password using email", async () => {
    const result = await client.verifyPassword({
      password: testUser.password,
      email: testUser.email,
    });
    
    expect(result.data?.valid).toBe(true);
  });

  it("should reject an invalid password using email", async () => {
    const result = await client.verifyPassword({
      password: "incorrect-password",
      email: testUser.email,
    });
    
    expect(result.data?.valid).toBe(false);
  });

  it("should throw error when not authenticated and no email provided", async () => {
    const result = await client.verifyPassword({
      password: "some-password",
    });
    
    expect(result.error?.status).toBe(400);
    expect(result.error?.message).toBe("Either authentication or email is required");
  });

  it("should throw error when user not found with email", async () => {
    const result = await client.verifyPassword({
      password: "some-password",
      email: "nonexistent@example.com",
    });
    
    expect(result.error?.status).toBe(400);
    expect(result.error?.message).toBe(BASE_ERROR_CODES.USER_NOT_FOUND);
  });
}); 