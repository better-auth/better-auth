import { ImageResponse } from "@vercel/og";
import * as z from "zod";

export const runtime = "edge";

const ogSchema = z.object({
	heading: z.string().trim().min(1).max(200).default("Better Auth"),
	section: z.string().trim().max(40).optional(),
	version: z.string().trim().max(20).optional(),
});

const colors = {
	background: "radial-gradient(120% 120% at 80% 0%, #111111 0%, #000000 55%)",
	titleGradient:
		"linear-gradient(100deg, #fafafa 0%, #d4d4d4 55%, #8a8a8a 100%)",
	logo: "#fafafa",
	divider: "rgba(255, 255, 255, 0.24)",
	eyebrow: "#8f8f8f",
	outline: "rgba(255, 255, 255, 0.09)",
	speck: "rgba(255, 255, 255, 0.35)",
};

const specks: Array<{ top: string; left: string; size: number }> = [
	{ top: "6%", left: "43%", size: 3 },
	{ top: "13%", left: "61%", size: 2 },
	{ top: "4%", left: "76%", size: 2 },
	{ top: "27%", left: "52%", size: 2 },
	{ top: "9%", left: "30%", size: 2 },
	{ top: "31%", left: "88%", size: 3 },
];

const ZERO_WIDTH_SPACE = "\u200b";

/**
 * Error codes like `account_already_linked_to_different_user` have no spaces,
 * so give them a break opportunity after each `_` instead of overflowing.
 */
function allowBreakAfterUnderscore(text: string) {
	return text.replaceAll("_", `_${ZERO_WIDTH_SPACE}`);
}

function titleFontSize(title: string) {
	if (title.length <= 30) return 80;
	if (title.length <= 60) return 68;
	if (title.length <= 100) return 56;
	return 48;
}

export async function GET(req: Request) {
	try {
		const url = new URL(req.url);
		const { heading, section, version } = ogSchema.parse(
			Object.fromEntries(url.searchParams),
		);

		const [geist, markSvg] = await Promise.all([
			fetch(new URL("../../../assets/Geist.ttf", import.meta.url)).then((res) =>
				res.arrayBuffer(),
			),
			fetch(
				new URL(
					"../../../public/branding/svg/better-auth-mark-light.svg",
					import.meta.url,
				),
			).then((res) => res.text()),
		]);
		const markUri = `data:image/svg+xml;base64,${btoa(markSvg)}`;

		const trimmedHeading = allowBreakAfterUnderscore(
			heading.length > 140 ? `${heading.substring(0, 137)}...` : heading,
		);

		return new ImageResponse(
			<div
				tw="flex w-full h-full relative"
				style={{ background: colors.background, fontFamily: "Geist" }}
			>
				{specks.map((speck, i) => (
					<div
						key={i}
						tw="absolute"
						style={{
							top: speck.top,
							left: speck.left,
							width: `${speck.size}px`,
							height: `${speck.size}px`,
							borderRadius: "9999px",
							background: colors.speck,
						}}
					/>
				))}

				{/* Rotated rounded-rect outline, bleeding off the top-right corner */}
				<div
					tw="absolute"
					style={{
						width: "560px",
						height: "640px",
						top: "-180px",
						right: "-200px",
						border: `1.5px solid ${colors.outline}`,
						borderRadius: "56px",
						transform: "rotate(14deg)",
					}}
				/>

				<div
					tw="flex flex-col justify-between w-full h-full"
					style={{ padding: "84px 240px 84px 96px" }}
				>
					<div tw="flex items-center">
						<img src={markUri} width={56} height={42} alt="Better Auth" />
						<div
							tw="flex"
							style={{
								width: "1.5px",
								height: "40px",
								margin: "0 24px",
								background: colors.divider,
							}}
						/>
						<div tw="flex items-baseline">
							<div tw="flex" style={{ fontSize: "38px", color: colors.logo }}>
								Docs
							</div>
							{version ? (
								// Nudged up so the smaller baseline-aligned text does not sag next to the mark
								<div
									tw="flex"
									style={{
										marginLeft: "14px",
										fontSize: "26px",
										color: colors.eyebrow,
										position: "relative",
										top: "-2px",
									}}
								>
									{version}
								</div>
							) : null}
						</div>
					</div>

					<div tw="flex flex-col">
						{section ? (
							<div
								tw="flex"
								style={{
									fontSize: "28px",
									color: colors.eyebrow,
									marginBottom: "28px",
								}}
							>
								{section}
							</div>
						) : null}
						<div
							tw="flex"
							style={{
								fontSize: `${titleFontSize(heading)}px`,
								fontWeight: 500,
								letterSpacing: "-0.02em",
								lineHeight: 1.12,
								backgroundImage: colors.titleGradient,
								backgroundClip: "text",
								color: "transparent",
							}}
						>
							{trimmedHeading}
						</div>
					</div>
				</div>
			</div>,
			{
				width: 1200,
				height: 630,
				fonts: [{ name: "Geist", data: geist, weight: 400, style: "normal" }],
				headers: {
					"Cache-Control":
						"public, max-age=86400, s-maxage=31536000, immutable",
				},
			},
		);
	} catch (err) {
		console.log({ err });
		return new Response("Failed to generate the OG image", { status: 500 });
	}
}
