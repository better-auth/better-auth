// cSpell:ignore affordances
"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import Footer from "@/components/landing/footer";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const colorTokens = [
	{ name: "background", label: "Background" },
	{ name: "foreground", label: "Foreground" },
	{ name: "primary", label: "Primary" },
	{ name: "primary-foreground", label: "Primary FG" },
	{ name: "secondary", label: "Secondary" },
	{ name: "secondary-foreground", label: "Secondary FG" },
	{ name: "muted", label: "Muted" },
	{ name: "muted-foreground", label: "Muted FG" },
	{ name: "accent", label: "Accent" },
	{ name: "accent-foreground", label: "Accent FG" },
	{ name: "border", label: "Border" },
	{ name: "input", label: "Input" },
	{ name: "ring", label: "Ring" },
	{ name: "destructive", label: "Destructive" },
] as const;

const calloutAccents = [
	{ name: "info", color: "bg-blue-500", label: "Info" },
	{ name: "warn", color: "bg-orange-500", label: "Warn" },
	{ name: "error", color: "bg-red-500", label: "Error" },
	{ name: "success", color: "bg-green-500", label: "Success" },
];

const radii = [
	{ label: "sharp (code)", value: "0" },
	{ label: "sm", value: "calc(var(--radius) - 2px)" },
	{ label: "md", value: "calc(var(--radius) - 1px)" },
	{ label: "lg (default)", value: "var(--radius)" },
	{ label: "xl", value: "calc(var(--radius) + 4px)" },
];

const shadows = [
	{ label: "xs", token: "shadow-xs" },
	{ label: "sm", token: "shadow-sm" },
	{ label: "md", token: "shadow-md" },
	{ label: "lg", token: "shadow-lg" },
	{ label: "xl", token: "shadow-xl" },
];

const logos = [
	{
		label: "Mark · Light",
		src: "/branding/better-auth-logo-light.svg",
		bg: "bg-white",
	},
	{
		label: "Mark · Dark",
		src: "/branding/better-auth-logo-dark.svg",
		bg: "bg-black",
	},
	{
		label: "Wordmark · Light",
		src: "/branding/better-auth-logo-wordmark-light.svg",
		bg: "bg-white",
	},
	{
		label: "Wordmark · Dark",
		src: "/branding/better-auth-logo-wordmark-dark.svg",
		bg: "bg-black",
	},
];

export function BrandClient() {
	return (
		<div className="relative min-h-dvh pt-14 lg:pt-0">
			<div className="relative text-foreground">
				<div className="flex flex-col lg:flex-row">
					<SideRail />
					<div className="relative w-full lg:w-[70%] overflow-x-hidden no-scrollbar">
						<div className="px-5 sm:px-6 lg:px-10 lg:pt-16 pb-10">
							<MobileHeader />
							<div className="space-y-16 pt-4 lg:pt-0">
								<Section id="foundations" eyebrow="01" title="Foundations">
									<ColorsBlock />
									<TypographyBlock />
									<RadiusBlock />
									<ShadowBlock />
								</Section>

								<Section id="motifs" eyebrow="02" title="Motifs">
									<MotifBlock />
								</Section>

								<Section id="components" eyebrow="03" title="Components">
									<ButtonsBlock />
									<FormBlock />
									<CardsBlock />
									<CalloutsBlock />
									<TabsBlock />
									<BadgesBlock />
									<AlertsBlock />
								</Section>

								<Section id="logo" eyebrow="04" title="Logo">
									<LogoBlock />
								</Section>

								<Section id="voice" eyebrow="05" title="Voice">
									<VoiceBlock />
								</Section>
							</div>
						</div>
						<Footer />
					</div>
				</div>
			</div>
		</div>
	);
}

function SideRail() {
	const sections = [
		{ label: "Foundations", href: "#foundations" },
		{ label: "Motifs", href: "#motifs" },
		{ label: "Components", href: "#components" },
		{ label: "Logo", href: "#logo" },
		{ label: "Voice", href: "#voice" },
	];

	return (
		<aside className="hidden lg:block relative w-full shrink-0 lg:w-[30%] lg:h-dvh border-b lg:border-b-0 lg:border-r border-foreground/[0.06] overflow-clip px-5 sm:px-6 lg:px-10 lg:sticky lg:top-0">
			<div className="absolute inset-0 bg-grid text-foreground/[0.04] pointer-events-none [mask-image:radial-gradient(ellipse_at_center,black_40%,transparent_75%)]" />
			<div className="relative w-full pt-6 md:pt-10 pb-6 lg:pb-0 flex flex-col justify-center lg:h-full">
				<div className="space-y-6">
					<div className="space-y-2">
						<p className="text-[11px] font-mono uppercase tracking-wider text-foreground/50">
							Design System
						</p>
						<h1 className="text-2xl md:text-3xl xl:text-4xl text-neutral-800 dark:text-neutral-200 tracking-tight leading-tight">
							<span className="underline underline-offset-4 decoration-foreground/40">
								Brand
							</span>
						</h1>
						<p className="text-sm text-foreground/70 dark:text-foreground/50 leading-relaxed max-w-[280px]">
							The tokens, components, and motifs that make up the Better Auth
							visual language. Everything here is pulled live from the same
							variables used across product and docs.
						</p>
					</div>

					<nav className="border-t border-foreground/10 pt-4 space-y-0">
						{sections.map((s, i) => (
							<Link
								key={s.href}
								href={s.href}
								className="flex items-baseline justify-between py-1.5 border-b border-dashed border-foreground/[0.06] last:border-0 group"
							>
								<span className="text-[11px] text-foreground/70 dark:text-foreground/50 uppercase tracking-wider group-hover:text-foreground/90 transition-colors">
									{s.label}
								</span>
								<span className="text-[11px] text-foreground/40 font-mono">
									0{i + 1}
								</span>
							</Link>
						))}
					</nav>

					<div className="flex items-center gap-3 pt-1">
						<a
							href="/branding/better-auth-brand-assets.zip"
							className="inline-flex items-center gap-1.5 px-5 py-2 bg-foreground text-background text-sm font-medium hover:opacity-90 transition-colors"
						>
							Download assets
						</a>
					</div>
				</div>
			</div>
		</aside>
	);
}

function MobileHeader() {
	return (
		<div className="lg:hidden relative border-b border-foreground/[0.06] overflow-hidden -mx-5 sm:-mx-6 px-5 sm:px-6 mb-5">
			<div className="absolute inset-0 bg-grid text-foreground/[0.04] pointer-events-none" />
			<div className="relative space-y-2 py-12">
				<p className="text-[11px] font-mono uppercase tracking-wider text-foreground/50">
					Design System
				</p>
				<h1 className="text-2xl md:text-3xl tracking-tight leading-tight">
					<span className="underline underline-offset-4 decoration-foreground/40">
						Brand
					</span>
				</h1>
				<p className="text-sm text-foreground/70 dark:text-foreground/50 leading-relaxed">
					The tokens, components, and motifs that make up Better Auth.
				</p>
			</div>
		</div>
	);
}

function Section({
	id,
	eyebrow,
	title,
	children,
}: {
	id: string;
	eyebrow: string;
	title: string;
	children: React.ReactNode;
}) {
	return (
		<section id={id} className="scroll-mt-24 space-y-8">
			<div className="flex items-baseline justify-between border-b border-foreground/10 pb-3">
				<h2 className="text-lg md:text-xl tracking-tight">{title}</h2>
				<span className="text-[11px] font-mono text-foreground/40">
					{eyebrow}
				</span>
			</div>
			<div className="space-y-10">{children}</div>
		</section>
	);
}

function Subsection({
	title,
	description,
	children,
}: {
	title: string;
	description?: string;
	children: React.ReactNode;
}) {
	return (
		<div className="space-y-4">
			<div className="space-y-1">
				<h3 className="text-sm font-medium">{title}</h3>
				{description ? (
					<p className="text-[13px] text-foreground/50 leading-relaxed max-w-prose">
						{description}
					</p>
				) : null}
			</div>
			{children}
		</div>
	);
}

function ColorsBlock() {
	return (
		<Subsection
			title="Color"
			description="The palette that makes up every surface in the product. Click a swatch to copy its hex."
		>
			<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-px bg-foreground/10 border border-foreground/10">
				{colorTokens.map((t) => (
					<ColorSwatch key={t.name} name={t.name} label={t.label} />
				))}
			</div>
			<div className="space-y-2 pt-2">
				<p className="text-[11px] font-mono uppercase tracking-wider text-foreground/50">
					Callout accents
				</p>
				<div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
					{calloutAccents.map((c) => (
						<AccentSwatch key={c.name} className={c.color} label={c.label} />
					))}
				</div>
			</div>
		</Subsection>
	);
}

function useResolvedHex(source: { cssVar?: string; className?: string }) {
	const { cssVar, className } = source;
	const [hex, setHex] = useState<string>("");
	useEffect(() => {
		if (typeof window === "undefined") return;
		const canvas = document.createElement("canvas");
		canvas.width = 1;
		canvas.height = 1;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		const toHex = (n: number) =>
			Math.round(n).toString(16).padStart(2, "0").toUpperCase();

		const resolve = () => {
			const probe = document.createElement("div");
			probe.style.position = "absolute";
			probe.style.visibility = "hidden";
			probe.style.pointerEvents = "none";
			if (cssVar) {
				probe.style.backgroundColor = `var(--${cssVar})`;
			} else if (className) {
				probe.className = className;
			}
			document.body.appendChild(probe);
			const computed = getComputedStyle(probe).backgroundColor;
			document.body.removeChild(probe);
			if (!computed) {
				setHex("");
				return;
			}
			ctx.clearRect(0, 0, 1, 1);
			ctx.fillStyle = "#00000000";
			ctx.fillRect(0, 0, 1, 1);
			ctx.fillStyle = computed;
			ctx.fillRect(0, 0, 1, 1);
			const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
			setHex(`#${toHex(r)}${toHex(g)}${toHex(b)}`);
		};

		resolve();
		const observer = new MutationObserver(resolve);
		observer.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ["class", "data-theme", "style"],
		});
		return () => observer.disconnect();
	}, [cssVar, className]);
	return hex;
}

function ColorSwatch({ name, label }: { name: string; label: string }) {
	const hex = useResolvedHex({ cssVar: name });
	const [copied, setCopied] = useState(false);
	const copy = () => {
		if (!hex) return;
		navigator.clipboard?.writeText(hex);
		setCopied(true);
		setTimeout(() => setCopied(false), 1200);
	};
	return (
		<button
			type="button"
			onClick={copy}
			className="bg-background p-3 space-y-2 text-left hover:bg-foreground/[0.02] transition-colors"
		>
			<div
				className="h-14 w-full border border-foreground/10"
				style={{ backgroundColor: `var(--${name})` }}
			/>
			<div className="space-y-0.5">
				<div className="flex items-baseline justify-between gap-2">
					<p className="text-[11px] font-medium">{label}</p>
					<p className="text-[10px] font-mono text-foreground/60">
						{copied ? "Copied" : hex || "—"}
					</p>
				</div>
				<p className="text-[10px] font-mono text-foreground/45">--{name}</p>
			</div>
		</button>
	);
}

function AccentSwatch({
	className,
	label,
}: {
	className: string;
	label: string;
}) {
	const hex = useResolvedHex({ className });
	const [copied, setCopied] = useState(false);
	const copy = () => {
		if (!hex) return;
		navigator.clipboard?.writeText(hex);
		setCopied(true);
		setTimeout(() => setCopied(false), 1200);
	};
	return (
		<button
			type="button"
			onClick={copy}
			className="border border-foreground/10 flex items-center gap-2 p-2 text-left hover:bg-foreground/[0.02] transition-colors"
		>
			<span className={`h-6 w-1 ${className}`} />
			<div className="flex-1 flex items-baseline justify-between gap-2">
				<span className="text-[11px] font-medium">{label}</span>
				<span className="text-[10px] font-mono text-foreground/60">
					{copied ? "Copied" : hex || "—"}
				</span>
			</div>
		</button>
	);
}

function TypographyBlock() {
	return (
		<Subsection
			title="Typography"
			description="Geist for UI, Geist Mono for code and metadata."
		>
			<div className="divide-y divide-foreground/10 border border-foreground/10">
				<TypeRow
					label="Geist Sans · H1"
					meta="text-4xl tracking-tight"
					className="text-4xl tracking-tight"
				>
					Authentication, better.
				</TypeRow>
				<TypeRow
					label="Geist Sans · H2"
					meta="text-xl tracking-tight"
					className="text-xl tracking-tight"
				>
					Drop-in, framework-agnostic.
				</TypeRow>
				<TypeRow
					label="Geist Sans · Body"
					meta="text-sm"
					className="text-sm text-foreground/80"
				>
					The quick brown fox jumps over the lazy dog. 0123456789.
				</TypeRow>
				<TypeRow
					label="Geist Mono · Label"
					meta="text-[11px] font-mono uppercase tracking-wider"
					className="text-[11px] font-mono uppercase tracking-wider text-foreground/70"
				>
					api / better-auth / v1.4.0
				</TypeRow>
				<TypeRow
					label="Geist Mono · Code"
					meta="font-mono text-sm"
					className="font-mono text-sm text-foreground/80"
				>
					{"const auth = betterAuth({ secret, baseURL });"}
				</TypeRow>
			</div>
		</Subsection>
	);
}

function TypeRow({
	label,
	meta,
	className,
	style,
	children,
}: {
	label: string;
	meta: string;
	className?: string;
	style?: React.CSSProperties;
	children: React.ReactNode;
}) {
	return (
		<div className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-3 p-4">
			<div className="space-y-0.5">
				<p className="text-[11px] font-medium">{label}</p>
				<p className="text-[10px] font-mono text-foreground/50">{meta}</p>
			</div>
			<div className={className} style={style}>
				{children}
			</div>
		</div>
	);
}

function RadiusBlock() {
	return (
		<Subsection
			title="Radius"
			description="Base is 0.2rem — deliberately tight. Code blocks and inline callouts break to 0 for a sharper, more editorial feel."
		>
			<div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
				{radii.map((r) => (
					<div
						key={r.label}
						className="border border-foreground/10 p-3 space-y-3"
					>
						<div
							className="h-12 w-full bg-foreground/5 border border-foreground/10"
							style={{ borderRadius: r.value }}
						/>
						<div className="space-y-0.5">
							<p className="text-[11px] font-medium">{r.label}</p>
							<p className="text-[10px] font-mono text-foreground/50">
								{r.value}
							</p>
						</div>
					</div>
				))}
			</div>
		</Subsection>
	);
}

function ShadowBlock() {
	return (
		<Subsection
			title="Shadow"
			description="Shadows are used sparingly — only to lift interactive affordances. Code blocks and cards stay flat."
		>
			<div className="grid grid-cols-2 sm:grid-cols-5 gap-4 p-4 border border-foreground/10">
				{shadows.map((s) => (
					<div key={s.token} className="space-y-2 text-center">
						<div
							className={`h-14 w-full bg-background border border-foreground/10 ${s.token}`}
						/>
						<p className="text-[11px] font-mono text-foreground/50">
							{s.token}
						</p>
					</div>
				))}
			</div>
		</Subsection>
	);
}

function MotifBlock() {
	return (
		<div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
			<MotifCard
				label="Grid · 32px"
				meta=".bg-grid"
				className="bg-grid text-foreground/20"
			/>
			<MotifCard
				label="Grid · 8px"
				meta=".bg-grid-small"
				className="bg-grid-small text-foreground/20"
			/>
			<MotifCard
				label="Dot · 16px"
				meta=".bg-dot"
				className="bg-dot text-foreground/30"
			/>
		</div>
	);
}

function MotifCard({
	label,
	meta,
	className,
}: {
	label: string;
	meta: string;
	className: string;
}) {
	return (
		<div className="border border-foreground/10">
			<div className={`h-36 w-full ${className}`} />
			<div className="flex items-baseline justify-between border-t border-foreground/10 px-3 py-2">
				<p className="text-[11px] font-medium">{label}</p>
				<p className="text-[10px] font-mono text-foreground/50">{meta}</p>
			</div>
		</div>
	);
}

function ButtonsBlock() {
	return (
		<Subsection title="Buttons" description="Six variants, four sizes.">
			<div className="border border-foreground/10 p-4 space-y-4">
				<div className="flex flex-wrap gap-2">
					<Button>Default</Button>
					<Button variant="secondary">Secondary</Button>
					<Button variant="outline">Outline</Button>
					<Button variant="ghost">Ghost</Button>
					<Button variant="link">Link</Button>
					<Button variant="destructive">Destructive</Button>
				</div>
				<div className="flex flex-wrap items-center gap-2 border-t border-foreground/5 pt-4">
					<Button size="sm">Small</Button>
					<Button>Default</Button>
					<Button size="lg">Large</Button>
					<Button size="icon" aria-label="icon">
						<svg
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
						>
							<path d="M5 12h14M12 5v14" strokeLinecap="round" />
						</svg>
					</Button>
				</div>
			</div>
		</Subsection>
	);
}

function FormBlock() {
	return (
		<Subsection title="Inputs" description="Sharp, minimal affordances.">
			<div className="border border-foreground/10 p-4 grid sm:grid-cols-2 gap-3">
				<label className="flex flex-col gap-1.5">
					<span className="text-[11px] font-mono uppercase tracking-wider text-foreground/50">
						Email
					</span>
					<Input type="email" placeholder="you@better-auth.com" />
				</label>
				<label className="flex flex-col gap-1.5">
					<span className="text-[11px] font-mono uppercase tracking-wider text-foreground/50">
						Password
					</span>
					<Input type="password" placeholder="••••••••" />
				</label>
			</div>
		</Subsection>
	);
}

function CardsBlock() {
	return (
		<Subsection
			title="Card"
			description="Flat border, no shadow. Uses dashed footer rules for meta."
		>
			<div className="grid sm:grid-cols-2 gap-3">
				<Card>
					<CardHeader>
						<CardTitle>Session</CardTitle>
						<CardDescription>
							The canonical unit of auth state on every request.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<p className="text-sm text-foreground/70">
							Cookies, JWTs, or both — configured per deployment.
						</p>
					</CardContent>
					<CardFooter>
						<span className="text-[11px] font-mono text-foreground/50">
							v1.4.0
						</span>
					</CardFooter>
				</Card>
				<Card>
					<CardHeader>
						<CardTitle>Plugin</CardTitle>
						<CardDescription>
							Opt-in capability — organizations, 2FA, magic links.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<p className="text-sm text-foreground/70">
							Each plugin ships its own schema, routes, and client helpers.
						</p>
					</CardContent>
					<CardFooter>
						<span className="text-[11px] font-mono text-foreground/50">
							30+ plugins
						</span>
					</CardFooter>
				</Card>
			</div>
		</Subsection>
	);
}

function CalloutsBlock() {
	return (
		<Subsection title="Callouts">
			<div className="space-y-2">
				<Callout type="info" title="Heads up">
					Callouts use a dashed left stripe sized to the accent type.
				</Callout>
				<Callout type="warn" title="Careful">
					This action rotates signing keys and invalidates every active session.
				</Callout>
				<Callout type="error" title="Broken">
					The database adapter returned an unexpected shape.
				</Callout>
				<Callout type="success" title="Nice">
					Your provider connected and synced successfully.
				</Callout>
			</div>
		</Subsection>
	);
}

function TabsBlock() {
	return (
		<Subsection title="Tabs">
			<div className="border border-foreground/10 p-4">
				<Tabs defaultValue="ts" className="w-full">
					<TabsList>
						<TabsTrigger value="ts">TypeScript</TabsTrigger>
						<TabsTrigger value="js">JavaScript</TabsTrigger>
						<TabsTrigger value="sh">Shell</TabsTrigger>
					</TabsList>
					<TabsContent value="ts">
						<pre className="mt-3 font-mono text-xs p-3 bg-foreground/[0.03] border border-foreground/10 overflow-x-auto">
							<code>{`import { betterAuth } from "better-auth";\n\nexport const auth = betterAuth({ secret: process.env.AUTH_SECRET });`}</code>
						</pre>
					</TabsContent>
					<TabsContent value="js">
						<pre className="mt-3 font-mono text-xs p-3 bg-foreground/[0.03] border border-foreground/10 overflow-x-auto">
							<code>{`const { betterAuth } = require("better-auth");\n\nmodule.exports.auth = betterAuth({ secret: process.env.AUTH_SECRET });`}</code>
						</pre>
					</TabsContent>
					<TabsContent value="sh">
						<pre className="mt-3 font-mono text-xs p-3 bg-foreground/[0.03] border border-foreground/10 overflow-x-auto">
							<code>pnpm add better-auth</code>
						</pre>
					</TabsContent>
				</Tabs>
			</div>
		</Subsection>
	);
}

function BadgesBlock() {
	return (
		<Subsection title="Badges">
			<div className="border border-foreground/10 p-4 flex flex-wrap gap-2">
				<Badge>default</Badge>
				<Badge variant="secondary">secondary</Badge>
				<Badge variant="destructive">destructive</Badge>
				<Badge variant="outline">outline</Badge>
			</div>
		</Subsection>
	);
}

function AlertsBlock() {
	return (
		<Subsection title="Alerts">
			<div className="space-y-3">
				<Alert>
					<AlertTitle>Auth secret updated</AlertTitle>
					<AlertDescription>
						Existing sessions remain valid until their next refresh.
					</AlertDescription>
				</Alert>
				<Alert variant="destructive">
					<AlertTitle>Sign-in failed</AlertTitle>
					<AlertDescription>
						The provider returned an invalid ID token.
					</AlertDescription>
				</Alert>
			</div>
		</Subsection>
	);
}

function LogoBlock() {
	return (
		<Subsection
			title="Logo"
			description="Use the mark at 24px minimum. Prefer the wordmark when the brand needs to read at a distance."
		>
			<div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
				{logos.map((l) => (
					<a
						key={l.src}
						href={l.src}
						download
						className="border border-foreground/10 group"
					>
						<div
							className={`h-28 w-full flex items-center justify-center ${l.bg}`}
						>
							<Image
								src={l.src}
								alt={l.label}
								width={120}
								height={60}
								className="max-h-16 w-auto"
							/>
						</div>
						<div className="flex items-baseline justify-between border-t border-foreground/10 px-3 py-2">
							<p className="text-[11px] font-medium">{l.label}</p>
							<span className="text-[10px] font-mono text-foreground/50 group-hover:text-foreground/90 transition-colors">
								.svg ↓
							</span>
						</div>
					</a>
				))}
			</div>
		</Subsection>
	);
}

function VoiceBlock() {
	const principles = [
		{
			title: "Clear over clever",
			body: "We name things what they are. Session, key, secret — not SessionManagerV2Provider.",
		},
		{
			title: "Terse, but warm",
			body: "Short sentences. No marketing fluff. Sound like a thoughtful engineer, not a billboard.",
		},
		{
			title: "Show the code",
			body: "A well-named snippet does more than a paragraph. Prose sets context; code proves it.",
		},
		{
			title: "Sharp, not loud",
			body: "Minimal radii, dashed dividers, mono for metadata. The design should feel precise, never decorative.",
		},
	];
	return (
		<Subsection
			title="Voice"
			description="How Better Auth communicates — across docs, product copy, and marketing."
		>
			<div className="grid sm:grid-cols-2 gap-3">
				{principles.map((p) => (
					<div key={p.title} className="border border-foreground/10 p-4">
						<p className="text-sm font-medium">{p.title}</p>
						<p className="text-sm text-foreground/60 leading-relaxed mt-1">
							{p.body}
						</p>
					</div>
				))}
			</div>
		</Subsection>
	);
}
