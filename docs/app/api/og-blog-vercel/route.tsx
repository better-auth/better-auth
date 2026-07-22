import { ImageResponse } from "@vercel/og";

export const runtime = "edge";

/**
 * Dedicated OG cover for the "Better Auth is joining Vercel" announcement.
 * Reuses the visual language of the generated blog covers (Geist, dark
 * radial gradient, specks, rotated outline) but adds a Better Auth × Vercel
 * logo lockup above the title. Rendered live and referenced from the post's
 * `image` frontmatter.
 */

const TITLE = "Better Auth is joining Vercel";
const DATE = "June 28, 2026";

const colors = {
	background: "radial-gradient(120% 120% at 80% 0%, #111111 0%, #000000 55%)",
	titleGradient:
		"linear-gradient(100deg, #fafafa 0%, #d4d4d4 55%, #8a8a8a 100%)",
	logo: "#fafafa",
	separator: "#6a6a6a",
	date: "#8f8f8f",
	outline: "rgba(255, 255, 255, 0.09)",
	speck: "rgba(255, 255, 255, 0.35)",
} as const;

const specks: Array<{ top: string; left: string; size: number }> = [
	{ top: "6%", left: "43%", size: 3 },
	{ top: "13%", left: "61%", size: 2 },
	{ top: "4%", left: "76%", size: 2 },
	{ top: "27%", left: "52%", size: 2 },
	{ top: "9%", left: "30%", size: 2 },
	{ top: "31%", left: "88%", size: 3 },
];

// Better Auth mark (viewBox 0 0 400 300) recolored for the dark cover.
const baMarkSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><path fill="${colors.logo}" d="M200 0h200v300H200V200h100V100H200zM0 0h100v100h100v100H100v100H0z"/></svg>`;

export async function GET() {
	try {
		const geist = await fetch(
			new URL("../../../assets/Geist.ttf", import.meta.url),
		).then((res) => res.arrayBuffer());

		// Vercel logotype ships with fill="currentColor"; force white for the dark bg.
		const vercelSvg = (
			await fetch(
				new URL("../../../public/companies/vercel.svg", import.meta.url),
			).then((res) => res.text())
		).replace(/currentColor/g, colors.logo);

		const baMarkUri = `data:image/svg+xml;base64,${btoa(baMarkSvg)}`;
		const vercelUri = `data:image/svg+xml;base64,${btoa(vercelSvg)}`;

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
					tw="flex flex-col justify-center w-full h-full"
					style={{ padding: "0 200px 40px 96px" }}
				>
					{/* Logo lockup: Better Auth × Vercel */}
					<div tw="flex items-center" style={{ marginBottom: "52px" }}>
						<img src={baMarkUri} width={61} height={46} alt="Better Auth" />
						<div
							tw="flex"
							style={{
								marginLeft: "22px",
								fontSize: "40px",
								fontWeight: 500,
								letterSpacing: "-0.02em",
								color: colors.logo,
							}}
						>
							Better Auth
						</div>
						<div
							tw="flex"
							style={{
								margin: "0 30px",
								fontSize: "30px",
								color: colors.separator,
							}}
						>
							×
						</div>
						<img src={vercelUri} width={171} height={34} alt="Vercel" />
					</div>

					<div
						tw="flex"
						style={{
							fontSize: "72px",
							fontWeight: 500,
							letterSpacing: "-0.02em",
							lineHeight: 1.16,
							backgroundImage: colors.titleGradient,
							backgroundClip: "text",
							color: "transparent",
						}}
					>
						{TITLE}
					</div>

					<div
						tw="flex"
						style={{ marginTop: "34px", fontSize: "30px", color: colors.date }}
					>
						{DATE}
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
