import { describe, expect, expectTypeOf } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { organization } from "./organization";
import { createAuthClient } from "../../client";
import { organizationClient } from "./client";
import { createAccessControl } from "./access";
import { ORGANIZATION_ERROR_CODES } from "./error-codes";
import { BetterAuthError } from "../../error";

describe("team", async (it) => {
  const { auth, signInWithTestUser, signInWithUser } = await getTestInstance({
    user: {
      modelName: "users",
    },
    plugins: [
      organization({
        async sendInvitationEmail(data, request) {},
        teamSupport: true,
        schema: {
          organization: {
            modelName: "team",
          },
          team: {
            modelName: "teamOrg",
          },
          member: {
            modelName: "teamMembers",
          },
        },
      }),
    ],
    logger: {
      level: "error",
    },
  });

  const { headers } = await signInWithTestUser();
  const client = createAuthClient({
    plugins: [organizationClient()],
    baseURL: "http://localhost:3000/api/auth",
    fetchOptions: {
      customFetchImpl: async (url, init) => {
        return auth.handler(new Request(url, init));
      },
    },
  });

  let organizationId: string;
  let teamId: string;

  it("should create an organization and a team", async () => {
    const createOrganizationResponse = await client.organization.create({
      name: "Test Organization",
      slug: "test-org",
      metadata: {
        test: "organization-metadata",
      },
      fetchOptions: {
        headers,
      },
    });
    console.log({ createOrganizationResponse });
    organizationId = createOrganizationResponse.data?.id as string;
    expect(createOrganizationResponse.data?.name).toBe("Test Organization");
    expect(createOrganizationResponse.data?.slug).toBe("test-org");
    expect(createOrganizationResponse.data?.members.length).toBe(1);
    expect(createOrganizationResponse.data?.metadata?.test).toBe(
      "organization-metadata",
    );

    const createTeamResponse = await client.organization?.createTeam({
      organizationId,
      data: {
        name: "Development Team",
        description: "Handles development tasks",
        status: "active",
      },
      fetchOptions: { headers },
    });
    teamId = createTeamResponse.data?.id as string;
    expect(createTeamResponse.data?.name).toBe("Development Team");
    expect(createTeamResponse.data?.status).toBe("active");
    expect(createTeamResponse.data?.organizationId).toBe(organizationId);
  });

  it("should get a team by teamId", async () => {
    const team = await client.organization?.getTeam({
      query: {
        teamId,
      },
      fetchOptions: { headers },
    });
    console.log({ team });
    expect(team.data?.id).toBe(teamId);
    expect(team.data?.name).toBe("Development Team");
    expect(team.data?.status).toBe("active");
  });

  it("should get all teams", async () => {
    const team = await client.organization?.getTeams({
      fetchOptions: { headers },
    });
    expect(team.data).toBeInstanceOf(Array);
    // since teamSupport: true; it creates default team when org is created.
    expect(team.data).toHaveLength(2);
  });
  it("should update a team", async () => {
    const updateTeamResponse = await client.organization?.updateTeam({
      teamId,
      data: {
        name: "Updated Development Team",
        description: "Handles all new development tasks",
        status: "active",
      },

      fetchOptions: { headers },
    });
    expect(updateTeamResponse.data?.name).toBe("Updated Development Team");
    expect(updateTeamResponse.data?.status).toBe("active");
    expect(updateTeamResponse.data?.description).toBe(
      "Handles all new development tasks",
    );
  });

  it("should remove a team", async () => {
    const removeTeamResponse = await client.organization?.removeTeam({
      teamId,
      organizationId,
      fetchOptions: { headers },
    });
    expect(removeTeamResponse.data?.message).toBe("Team removed successfully.");

    const teamNotFound = await client.organization?.getTeam({
      query: {
        teamId,
      },
      fetchOptions: { headers },
    });
    expect(teamNotFound.error?.status).toBe(404);
    expect(teamNotFound.error?.message).toBe(
      "Team not found or does not belong to the current organization.",
    );
  });
});
