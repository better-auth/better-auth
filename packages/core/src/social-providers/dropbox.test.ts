import {
	afterEach,
	assertType,
	beforeEach,
	expect,
	expectTypeOf,
	it,
	vi,
} from "vitest";
import type { DropboxProfile } from "./dropbox";
import { dropbox } from "./dropbox";

const profile = {
	account_id: "dropbox-user",
	name: {
		given_name: "Jane",
		surname: "Doe",
		familiar_name: "Jane",
		display_name: "Jane Doe",
		abbreviated_name: "JD",
	},
	email: "jane@example.com",
	email_verified: true,
	disabled: false,
	locale: "en",
	referral_link: "https://db.tt/example",
	is_paired: false,
	team: null,
	account_type: { ".tag": "basic" as const },
	root_info: {
		".tag": "user" as const,
		root_namespace_id: "123",
		home_namespace_id: "123",
	},
};
const mockedFetch = vi.fn<typeof fetch>();
beforeEach(() => {
	mockedFetch.mockImplementation(async (input, init) => {
		const request = new Request(input, init);
		expect(request.url).toBe(
			"https://api.dropboxapi.com/2/users/get_current_account",
		);
		expect(request.method).toBe("POST");
		expect(request.headers.get("authorization")).toBe("Bearer access-token");
		return Response.json(profile);
	});
	vi.stubGlobal("fetch", mockedFetch);
});
afterEach(() => vi.unstubAllGlobals());

/**
 * @see https://github.com/dropbox/dropbox-api-spec/blob/3c363a594dafbe0f4646e73352b62a4767540d25/users.stone#L179-L230
 */
it("maps a personal Dropbox account without a photo or team", async () => {
	assertType<DropboxProfile>(profile);
	const result = await dropbox({ clientId: "dropbox-app" }).getUserInfo({
		accessToken: "access-token",
	});
	expect(result?.data).toEqual(profile);
	expect(result?.user).toEqual({
		name: "Jane Doe",
		email: "jane@example.com",
		emailVerified: true,
		image: undefined,
	});
});

/**
 * @see https://github.com/dropbox/dropbox-api-spec/blob/3c363a594dafbe0f4646e73352b62a4767540d25/users.stone#L179-L206
 * @see https://github.com/dropbox/dropbox-api-spec/blob/b63b5d5be0d1473b6bf237843fea977574c18fad/team_policies.stone
 */
it("types the current Dropbox account", () => {
	expectTypeOf<DropboxProfile["disabled"]>().toEqualTypeOf<boolean>();
	expectTypeOf<DropboxProfile["locale"]>().toEqualTypeOf<string>();
	expectTypeOf<DropboxProfile["is_paired"]>().toEqualTypeOf<boolean>();

	type SharingPolicies = NonNullable<
		DropboxProfile["team"]
	>["sharing_policies"];
	assertType<SharingPolicies>({
		shared_folder_member_policy: { ".tag": "team_and_approved" },
		shared_folder_join_policy: { ".tag": "from_anyone" },
		shared_link_create_policy: { ".tag": "default_no_one" },
		group_creation_policy: { ".tag": "admins_and_members" },
		shared_folder_link_restriction_policy: { ".tag": "members" },
		enforce_link_password_policy: { ".tag": "required" },
		default_link_expiration_days_policy: { ".tag": "day_180" },
		shared_link_default_permissions_policy: { ".tag": "other" },
	});
	// @ts-expect-error Group creation has no other variant.
	assertType<SharingPolicies["group_creation_policy"]>({ ".tag": "other" });
	// @ts-expect-error Link creation only accepts documented tags.
	assertType<SharingPolicies["shared_link_create_policy"]>({
		".tag": "invalid",
	});
	assertType<DropboxProfile["root_info"]>({
		".tag": "team",
		root_namespace_id: "123",
		home_namespace_id: "456",
		home_path: "/Jane",
	});
});

/**
 * @see https://github.com/dropbox/dropbox-api-spec/blob/3c363a594dafbe0f4646e73352b62a4767540d25/common.stone#L49-L59
 */
it("distinguishes team and user root paths", () => {
	assertType<DropboxProfile["team"]>(null);
	assertType<DropboxProfile["root_info"]>({
		".tag": "user",
		root_namespace_id: "123",
		home_namespace_id: "123",
		home_path: "/Jane",
	});
	// @ts-expect-error Team roots require a home path.
	assertType<DropboxProfile["root_info"]>({
		".tag": "team",
		root_namespace_id: "123",
		home_namespace_id: "456",
	});
});
