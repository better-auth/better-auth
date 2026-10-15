import { betterFetch } from "@better-fetch/fetch";
import { assertType, expect, it, vi } from "vitest";
import type { DiscordProfile } from "./discord";
import { discord } from "./discord";

vi.mock(import("@better-fetch/fetch"), () => ({ betterFetch: vi.fn() }));

/**
 * @see https://docs.discord.com/developers/resources/user#user-object
 */
it("accepts Discord identity profiles without optional fields", async () => {
	const profile = {
		id: "80351110224678912",
		username: "nelly",
		discriminator: "1337",
		global_name: null,
		avatar: null,
	};
	const imageURL = "https://cdn.discordapp.com/embed/avatars/2.png";
	assertType<DiscordProfile>({ ...profile, image_url: imageURL });
	vi.mocked(betterFetch).mockResolvedValueOnce({ data: profile, error: null });
	const provider = discord({
		clientId: "discord-app",
		disableDefaultScope: true,
		scope: ["identify"],
	});

	const result = await provider.getUserInfo({ accessToken: "access-token" });

	assertType<string>(result!.data.image_url);
	expect(result).toEqual({
		user: {
			name: "nelly",
			email: undefined,
			emailVerified: false,
			image: imageURL,
		},
		data: { ...profile, image_url: imageURL },
	});
});
