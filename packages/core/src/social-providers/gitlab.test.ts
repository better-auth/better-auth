import { betterFetch } from "@better-fetch/fetch";
import { assertType, expect, it, vi } from "vitest";
import type { GitlabProfile } from "./gitlab";
import { gitlab } from "./gitlab";

vi.mock(import("@better-fetch/fetch"), () => ({ betterFetch: vi.fn() }));

/**
 * @see https://docs.gitlab.com/api/users/#retrieve-the-current-user
 * @see https://github.com/gitlabhq/gitlabhq/blob/803abea42cb2e61278e3fe6a20e4fe4fb5046f43/lib/api/entities/user_public.rb#L5-L14
 * @see https://github.com/gitlabhq/gitlabhq/blob/a2042efa3487d2c5077cb265a6754727aa6f800d/db/structure.sql#L31231-L31243
 */
it("accepts nullable and conditional GitLab profile fields", () => {
	const profileFields = {
		avatar_url: null,
		pronouns: null,
		location: null,
		work_information: null,
		public_email: null,
		local_time: null,
		last_sign_in_at: null,
		confirmed_at: null,
		theme_id: null,
		last_activity_on: null,
		current_sign_in_at: null,
		shared_runners_minutes_limit: null,
		extra_shared_runners_minutes_limit: null,
	};
	assertType<Pick<GitlabProfile, keyof typeof profileFields>>(profileFields);
	assertType<
		Pick<
			GitlabProfile,
			| "followers"
			| "following"
			| "skype"
			| "shared_runners_minutes_limit"
			| "extra_shared_runners_minutes_limit"
		>
	>({});
});

/**
 * @see https://github.com/gitlabhq/gitlabhq/blob/a2042efa3487d2c5077cb265a6754727aa6f800d/app/services/gravatar_service.rb#L3-L8
 */
it("preserves a missing GitLab avatar while leaving the local image unset", async () => {
	const profile = {
		id: 1,
		username: "gitlab-user",
		name: "GitLab User",
		email: "user@example.com",
		state: "active",
		avatar_url: null,
		pronouns: null,
	};
	vi.mocked(betterFetch).mockResolvedValueOnce({ data: profile, error: null });
	const result = await gitlab({ clientId: "gitlab-app" }).getUserInfo({
		accessToken: "access-token",
	});

	expect(result?.user.image).toBeUndefined();
	expect(result?.data).toEqual(profile);
});
