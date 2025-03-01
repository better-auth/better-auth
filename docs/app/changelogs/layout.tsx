import type { ReactNode } from "react";

const title = "Changel";
const description = "Latest changes , fixes and updates.";
const ogImage = "https://better-auth.com/release-og/changelog-og.png";

export const metadata = {
	metadataBase: new URL("https://better-auth.com/changelogs"),
	title,
	description,
	openGraph: {
		title,
		description,
		images: [
			{
				url: ogImage,
			},
		],
		url: "https://better-auth.com/changelogs",
	},
	twitter: {
		card: "summary_large_image",
		title,
		description,
		images: [ogImage],
	},
};
export default function Layout({ children }: { children: ReactNode }) {
	return <div>{children}</div>;
}
