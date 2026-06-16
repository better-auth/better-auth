import { ImageResponse } from "@vercel/og";
import * as z from "zod";

export const runtime = "edge";

const ogSchema = z.object({
	title: z.string().trim().min(1).max(200),
	date: z.string().trim().max(40).optional(),
	theme: z.enum(["light", "dark"]).default("dark"),
});

const themes = {
	dark: {
		background: "radial-gradient(120% 120% at 80% 0%, #111111 0%, #000000 55%)",
		titleGradient:
			"linear-gradient(100deg, #fafafa 0%, #d4d4d4 55%, #8a8a8a 100%)",
		date: "#8f8f8f",
		outline: "rgba(255, 255, 255, 0.09)",
		speck: "rgba(255, 255, 255, 0.35)",
	},
	light: {
		background: "radial-gradient(120% 120% at 80% 0%, #ffffff 0%, #f1f1f0 55%)",
		titleGradient:
			"linear-gradient(100deg, #0a0a0a 0%, #2e2e2e 55%, #6f6f6f 100%)",
		date: "#7a7a7a",
		outline: "rgba(0, 0, 0, 0.09)",
		speck: "rgba(0, 0, 0, 0.3)",
	},
} as const;

const specks: Array<{ top: string; left: string; size: number }> = [
	{ top: "6%", left: "43%", size: 3 },
	{ top: "13%", left: "61%", size: 2 },
	{ top: "4%", left: "76%", size: 2 },
	{ top: "27%", left: "52%", size: 2 },
	{ top: "9%", left: "30%", size: 2 },
	{ top: "31%", left: "88%", size: 3 },
];

function titleFontSize(title: string) {
	if (title.length <= 40) return 72;
	if (title.length <= 80) return 62;
	if (title.length <= 120) return 54;
	return 46;
}

export async function GET(req: Request) {
	try {
		const url = new URL(req.url);
		const { title, date, theme } = ogSchema.parse(
			Object.fromEntries(url.searchParams),
		);

		const geist = await fetch(
			new URL("../../../assets/Geist.ttf", import.meta.url),
		).then((res) => res.arrayBuffer());

		const colors = themes[theme];
		const trimmedTitle =
			title.length > 140 ? `${title.substring(0, 137)}...` : title;

		return new ImageResponse(
			<div
				tw="flex w-full h-full relative"
				style={{
					background: colors.background,
					fontFamily: "Geist",
				}}
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
					tw="flex flex-col justify-center w-full h-full"
					style={{ padding: "0 240px 40px 96px" }}
				>
					<div
						tw="flex"
						style={{
							fontSize: `${titleFontSize(trimmedTitle)}px`,
							fontWeight: 500,
							letterSpacing: "-0.02em",
							lineHeight: 1.16,
							backgroundImage: colors.titleGradient,
							backgroundClip: "text",
							color: "transparent",
						}}
					>
						{trimmedTitle}
					</div>
					{date ? (
						<div
							tw="flex"
							style={{
								marginTop: "36px",
								fontSize: "30px",
								color: colors.date,
							}}
						>
							{date}
						</div>
					) : null}
				</div>
			</div>,
			{
				width: 1200,
				height: 630,
				fonts: [
					{
						name: "Geist",
						data: geist,
						weight: 400,
						style: "normal",
					},
				],
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
