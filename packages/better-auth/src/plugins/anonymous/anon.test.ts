import { describe, expect, it } from "vitest";
import { anonymous } from ".";
import { getTestInstance } from "../../test-utils/test-instance";
import { createAuthClient } from "../../client";
import { anonymousClient } from "./client";

describe("anonymous", async () => {
  const { customFetchImpl } = await getTestInstance({
    plugins: [anonymous()],
  });
  const client = createAuthClient({
    plugins: [anonymousClient()],
    fetchOptions: {
      customFetchImpl,
    },
    baseURL: "http://localhost:3000/api/auth",
  });

  it("should sign in anonymously", async () => {
    const anonUser = await client.signIn.anonymous();
    const userId = anonUser.data?.user.id;
    const isAnonymous = anonUser.data?.user.isAnonymous;
    const sessionId = anonUser.data?.session.id;
    console.log({ userId, sessionId });
    expect(userId).toBeDefined();
    expect(isAnonymous).toBeTruthy();
    expect(sessionId).toBeDefined();
  });
  it("link anonymous user account", async () => {
    const anonUser = await client.signIn.anonymous();
    const userId = anonUser.data?.user.id;
    const sessionId = anonUser.data?.session.id;
    expect(sessionId).toBeDefined();
    expect(userId).toBeDefined();
    const linkedAccount = await client.user.linkAnonymous({
      email: "valid-email@email.com",
      password: "valid-password",
    });
    expect(linkedAccount.data?.user).toBeDefined();
    expect(linkedAccount.data?.session).toBeDefined();
  });
});
