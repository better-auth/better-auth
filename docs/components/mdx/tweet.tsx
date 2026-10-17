import { Tweet } from "react-tweet";
import { TweetThemeWrapper } from "./tweet-theme";

/**
 * Embeds a tweet by its id (the trailing number in an x.com/status/<id> URL).
 * The tweet is fetched at build time via react-tweet's static fetcher, so no
 * client-side widget script is loaded.
 *
 * @example
 * <Tweet id="1838257293546123611" />
 */
export function BlogTweet({ id }: { id: string }) {
	return (
		<TweetThemeWrapper>
			<Tweet id={id} />
		</TweetThemeWrapper>
	);
}
