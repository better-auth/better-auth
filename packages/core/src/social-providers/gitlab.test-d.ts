import { assertType, it } from "vitest";
import type { GitlabProfile } from "./gitlab";

/**
 * @see https://docs.gitlab.com/api/users/#retrieve-the-current-user
 * @see https://github.com/gitlabhq/gitlabhq/blob/master/lib/api/entities/user_public.rb
 */
it("accepts nullable and conditional GitLab profile fields", () => {
	const profileFields = {
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
