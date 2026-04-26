"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
	ChevronDownIcon,
	History,
	Palette,
	PencilLine,
	Scale,
	Search,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { getVersionFromPathname, versionedDocsHref } from "@/lib/docs-versions";
import { cn } from "@/lib/utils";
import DarkPng from "../../public/branding/better-auth-logo-dark.png";
import WhitePng from "../../public/branding/better-auth-logo-light.png";
import { Logo } from "../icons/logo";
import { contents } from "../sidebar-content";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "../ui/accordion";
import { Badge } from "../ui/badge";
import LogoContextMenu from "./logo-context-menu";

interface NavFileItem {
	name: string;
	href: string;
	path?: string;
	external?: boolean;
}

const navFiles: NavFileItem[] = [
	{ name: "readme", href: "/" },
	{ name: "docs", href: "/docs" },
];

const pricingFile: NavFileItem = { name: "pricing", href: "/pricing" };

interface ProductItem {
	title: string;
	tagline: string;
	description: string;
	href: string;
	Icon: React.ComponentType<{ className?: string }>;
	Pattern?: React.FC<{ className?: string }>;
	patternClassName?: string;
	BgPattern?: React.FC<{ className?: string }>;
	bgPatternClassName?: string;
}

const FrameworkLogoIcon: React.FC<{ className?: string }> = ({ className }) => (
	<svg
		viewBox="0 0 30 45"
		fill="currentColor"
		className={`${className ?? ""} rotate-12`}
		aria-hidden="true"
	>
		<path
			fillRule="evenodd"
			clipRule="evenodd"
			d="M0 0H15V15H30V30H15V45H0V30V15V0Z"
		/>
	</svg>
);

const InfraLogoIcon: React.FC<{ className?: string }> = ({ className }) => (
	<svg
		viewBox="30 0 30 45"
		fill="currentColor"
		className={`${className ?? ""} -rotate-12`}
		aria-hidden="true"
	>
		<path
			fillRule="evenodd"
			clipRule="evenodd"
			d="M45 30V15H30V0H45H60V15V30V45H45H30V30H45Z"
		/>
	</svg>
);

const CommunityIcon: React.FC<{ className?: string }> = ({ className }) => (
	<svg
		xmlns="http://www.w3.org/2000/svg"
		width="1em"
		height="1em"
		viewBox="0 0 20 20"
		className={className}
		aria-hidden="true"
	>
		<path
			fill="currentColor"
			d="M10 3a2 2 0 1 0 0 4a2 2 0 0 0 0-4M7 5a3 3 0 1 1 6 0a3 3 0 0 1-6 0M5.053 9.996q-.051.244-.051.504v.545l-2.631.705a.5.5 0 0 0-.354.612l.647 2.415A3 3 0 0 0 5.98 16.97c.23.31.495.594.789.843l-.171.05a4 4 0 0 1-4.9-2.828l-.647-2.415a1.5 1.5 0 0 1 1.061-1.837zm9.949 1.049V10.5q-.001-.26-.05-.504l2.94.788a1.5 1.5 0 0 1 1.06 1.837l-.647 2.415a4 4 0 0 1-5.07 2.778q.443-.376.789-.843a3 3 0 0 0 3.315-2.194l.648-2.415a.5.5 0 0 0-.354-.612zM15 6.5a1.5 1.5 0 1 1 3 0a1.5 1.5 0 0 1-3 0M16.5 4a2.5 2.5 0 1 0 0 5a2.5 2.5 0 0 0 0-5m-13 1a1.5 1.5 0 1 0 0 3a1.5 1.5 0 0 0 0-3M1 6.5a2.5 2.5 0 1 1 5 0a2.5 2.5 0 0 1-5 0M7.5 9A1.5 1.5 0 0 0 6 10.5V14a4 4 0 0 0 8 0v-3.5A1.5 1.5 0 0 0 12.5 9zM7 10.5a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 .5.5V14a3 3 0 1 1-6 0z"
		/>
	</svg>
);

const CareersIcon: React.FC<{ className?: string }> = ({ className }) => (
	<svg
		xmlns="http://www.w3.org/2000/svg"
		width="1em"
		height="1em"
		viewBox="0 0 24 24"
		className={className}
		aria-hidden="true"
	>
		<path
			fill="currentColor"
			d="M3.212 20.423q-.085.039-.186.038t-.187-.03q-.127-.064-.175-.188t-.023-.231q.013-.193.175-.321q.163-.13.396-.177q.315-.277.75-.304q.434-.027.848.002q.342.023.564-.02t.403-.28q.189-.368.215-.78q.027-.413.08-.836q.051-.5.233-.936t.607-.696q.315-.277.753-.304q.437-.027.85.002q.343.023.572-.02t.41-.28q.188-.368.205-.78t.07-.836q.051-.5.233-.936t.607-.696q.315-.277.753-.295t.85.012q.343.023.572-.029t.41-.29q.188-.368.208-.78t.072-.836q.052-.5.243-.936q.192-.437.617-.696q.315-.277.753-.295t.85.012q.343.023.572-.029t.41-.29q.188-.368.208-.78t.072-.836q.052-.5.243-.927q.192-.427.617-.705q.315-.277.753-.298q.437-.02.85.009l.717-.021q.345-.01.607-.138q.146-.033.252.072q.105.104.119.25q-.014.193-.176.325t-.395.18q-.316.276-.753.303q-.438.027-.851-.002q-.343-.023-.571.029q-.23.052-.41.29q-.188.368-.209.78t-.072.836q-.052.5-.243.937q-.191.436-.616.696q-.316.277-.75.294q-.435.017-.848-.012q-.343-.023-.565.029t-.403.29q-.188.368-.215.78t-.08.836q-.051.494-.223.934q-.172.439-.597.699q-.335.277-.77.297q-.434.02-.847-.009q-.324-.023-.565.045q-.242.069-.403.288q-.17.348-.206.76t-.088.836q-.052.5-.237.937q-.184.436-.61.696q-.315.277-.759.306t-.858.001q-.323-.023-.552.026q-.229.05-.41.288q-.169.348-.198.76t-.082.836q-.052.5-.243.937q-.192.436-.617.696q-.315.277-.75.306q-.434.03-.848.001q-.323-.023-.606-.005q-.284.017-.523.209M6 10q-1.652 0-2.826-1.174T2 6q0-1.677 1.174-2.839T6 2q1.677 0 2.839 1.162T10 6q0 1.652-1.161 2.826T6 10m0-1q1.275 0 2.138-.875T9 6q0-1.275-.862-2.137T6 3q-1.25 0-2.125.863T3 6q0 1.25.875 2.125T6 9m10.616 13q-.672 0-1.144-.472T15 20.385v-3.77q0-.67.472-1.143q.472-.472 1.144-.472h3.769q.67 0 1.143.472q.472.472.472 1.144v3.769q0 .67-.472 1.143q-.472.472-1.143.472zm0-1h3.769q.269 0 .442-.173t.173-.442v-3.77q0-.269-.173-.442T20.385 16h-3.77q-.269 0-.442.173t-.173.443v3.768q0 .27.173.443t.443.173M6 6"
		/>
	</svg>
);

const TimelinePattern: React.FC<{ className?: string }> = ({ className }) => (
	<svg
		width="56"
		height="56"
		viewBox="0 0 56 56"
		fill="none"
		shapeRendering="geometricPrecision"
		className={className}
		aria-hidden="true"
	>
		<line x1="6" y1="6" x2="6" y2="50" stroke="currentColor" strokeWidth="1" />
		<circle cx="6" cy="10" r="1.75" fill="currentColor" />
		<circle cx="6" cy="28" r="1.75" fill="currentColor" />
		<circle cx="6" cy="46" r="1.75" fill="currentColor" />
		<line
			x1="14"
			y1="10"
			x2="50"
			y2="10"
			stroke="currentColor"
			strokeWidth="1"
		/>
		<line
			x1="14"
			y1="28"
			x2="40"
			y2="28"
			stroke="currentColor"
			strokeWidth="1"
		/>
		<line
			x1="14"
			y1="46"
			x2="32"
			y2="46"
			stroke="currentColor"
			strokeWidth="1"
		/>
	</svg>
);

const ScribblePattern: React.FC<{ className?: string }> = ({ className }) => (
	<svg
		width="64"
		height="34"
		viewBox="0 0 64 34"
		fill="none"
		className={className}
		aria-hidden="true"
	>
		<path
			d="M2 14 C 8 2, 14 2, 18 14 S 28 26, 34 14 S 48 2, 54 14 S 62 20, 62 20"
			stroke="currentColor"
			strokeWidth="1.4"
			strokeLinecap="round"
			fill="none"
		/>
		<path
			d="M4 26 C 10 22, 20 28, 28 24 S 44 28, 52 24"
			stroke="currentColor"
			strokeWidth="1.1"
			strokeLinecap="round"
			fill="none"
			opacity="0.7"
		/>
	</svg>
);

const _HorizontalLinesPattern: React.FC<{ className?: string }> = ({
	className,
}) => {
	const rows = 40;
	const width = 100;
	const height = rows * 3;
	const lines: React.ReactElement[] = [];
	for (let i = 0; i < rows; i++) {
		const y = i * 3 + 1;
		lines.push(
			<line
				key={i}
				x1={0}
				y1={y}
				x2={width}
				y2={y}
				stroke="currentColor"
				strokeWidth="0.75"
			/>,
		);
	}
	return (
		<svg
			width="100%"
			height="100%"
			viewBox={`0 0 ${width} ${height}`}
			preserveAspectRatio="none"
			className={className}
			aria-hidden="true"
		>
			{lines}
		</svg>
	);
};

const VerticalLinesPattern: React.FC<{ className?: string }> = ({
	className,
}) => {
	const cols = 72;
	const width = cols * 3;
	const height = 100;
	const lines: React.ReactElement[] = [];
	for (let i = 0; i < cols; i++) {
		const x = i * 3 + 1;
		lines.push(
			<line
				key={i}
				x1={x}
				y1={0}
				x2={x}
				y2={height}
				stroke="currentColor"
				strokeWidth="0.75"
			/>,
		);
	}
	return (
		<svg
			width="100%"
			height="100%"
			viewBox={`0 0 ${width} ${height}`}
			preserveAspectRatio="none"
			className={className}
			aria-hidden="true"
		>
			{lines}
		</svg>
	);
};

const _CareersPattern: React.FC<{ className?: string }> = ({ className }) => {
	const cols = 80;
	const rows = 48;
	const cell = 2;
	const gap = 1;
	const stride = cell + gap;
	const width = cols * stride;
	const height = rows * stride;
	const rects: React.ReactElement[] = [];
	for (let r = 0; r < rows; r++) {
		for (let c = 0; c < cols; c++) {
			const nx = c / (cols - 1);
			const ny = r / (rows - 1);
			// Diagonal gradient from top-right (dense) to bottom-left (sparse).
			// t = 0 at top-right, t = 1 at bottom-left, iso-lines run diagonally.
			const t = (1 - nx + ny) / 2;
			const density = 1 - t * 0.95;
			// Deterministic pseudo-random hash per cell.
			const seed = (c * 1664525 + r * 1013904223) ^ ((c + 17) * (r + 31));
			const rand = ((seed >>> 0) % 10000) / 10000;
			if (rand < density) {
				rects.push(
					<rect
						key={`${c}-${r}`}
						x={c * stride}
						y={r * stride}
						width={cell}
						height={cell}
					/>,
				);
			}
		}
	}
	return (
		<svg
			width="100%"
			height="100%"
			viewBox={`0 0 ${width} ${height}`}
			preserveAspectRatio="none"
			fill="currentColor"
			className={className}
			aria-hidden="true"
		>
			{rects}
		</svg>
	);
};

const products: ProductItem[] = [
	{
		title: "Framework",
		tagline: "Open source",
		description:
			"The TypeScript auth library. Plugins, adapters, and 20+ social providers.",
		href: "/docs/introduction",
		Icon: FrameworkLogoIcon,
		Pattern: VerticalLinesPattern,
		patternClassName:
			"absolute inset-0 w-full h-full text-primary/10 pointer-events-none [mask-image:linear-gradient(to_left,black_0%,transparent_40%)]",
	},
	{
		title: "Infrastructure",
		tagline: "Hosted platform",
		description:
			"Dashboard, audit logs, security detection, SSO, and abuse protection.",
		href: "/pricing",
		Icon: InfraLogoIcon,
		Pattern: VerticalLinesPattern,
		patternClassName:
			"absolute inset-0 w-full h-full text-primary/10 pointer-events-none [mask-image:linear-gradient(to_left,black_0%,transparent_40%)]",
	},
];

const featuredResources: ProductItem[] = [
	{
		title: "Blog",
		tagline: "Writing",
		description: "Engineering, product, and updates",
		href: "/blog",
		Icon: PencilLine,
		Pattern: ScribblePattern,
		patternClassName:
			"absolute right-3 top-3 text-foreground/30 group-hover/p:text-foreground/60 transition-colors duration-200 pointer-events-none",
	},
	{
		title: "Changelog",
		tagline: "Shipped",
		description: "Latest releases and improvements",
		href: "/changelog",
		Icon: History,
		Pattern: TimelinePattern,
		patternClassName:
			"absolute right-3 top-3 text-foreground/30 group-hover/p:text-foreground/60 transition-colors duration-200 pointer-events-none",
	},
];

interface LinkResource {
	title: string;
	href: string;
	Icon: React.ComponentType<{ className?: string }>;
}

const linkResources: LinkResource[] = [
	{ title: "Community", href: "/community", Icon: CommunityIcon },
	{ title: "Careers", href: "/careers", Icon: CareersIcon },
	{ title: "Brand", href: "/brand", Icon: Palette },
	{ title: "Legal", href: "/legal", Icon: Scale },
];

const resourceFiles: NavFileItem[] = [
	...featuredResources.map((r) => ({
		name: r.title.toLowerCase(),
		href: r.href,
	})),
	...linkResources.map((r) => ({
		name: r.title.toLowerCase(),
		href: r.href,
	})),
];

interface MobileMenuSection {
	name: string;
	href?: string;
	children?: NavFileItem[];
}

const mobileMenuSections: MobileMenuSection[] = [
	{
		name: "products",
		children: products.map((p) => ({
			name: p.title.toLowerCase(),
			href: p.href,
		})),
	},
	{ name: "pricing", href: "/pricing" },
	{ name: "resources", children: resourceFiles },
	{ name: "enterprise", href: "/enterprise" },
];

const logoAssets = {
	darkSvg: `
    <svg width="500" height="500" viewBox="0 0 500 500" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="500" height="500" fill="black"/>
    <rect x="69" y="121" width="86.9879" height="259" fill="white"/>
    <rect x="337.575" y="121" width="92.4247" height="259" fill="white"/>
    <rect x="427.282" y="121" width="83.4555" height="174.52" transform="rotate(90 427.282 121)" fill="white"/>
    <rect x="430" y="296.544" width="83.4555" height="177.238" transform="rotate(90 430 296.544)" fill="white"/>
    <rect x="252.762" y="204.455" width="92.0888" height="96.7741" transform="rotate(90 252.762 204.455)" fill="white"/>
    </svg>
    `,
	whiteSvg: `
    <svg width="500" height="500" viewBox="0 0 500 500" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="500" height="500" fill="white"/>
    <rect x="69" y="121" width="86.9879" height="259" fill="black"/>
    <rect x="337.575" y="121" width="92.4247" height="259" fill="black"/>
    <rect x="427.282" y="121" width="83.4555" height="174.52" transform="rotate(90 427.282 121)" fill="black"/>
    <rect x="430" y="296.544" width="83.4555" height="177.238" transform="rotate(90 430 296.544)" fill="black"/>
    <rect x="252.762" y="204.455" width="92.0888" height="96.7741" transform="rotate(90 252.762 204.455)" fill="black"/>
    </svg>
    `,
	darkWordmark: `
    <svg width="1024" height="256" viewBox="0 0 1024 256" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="1024" height="256" fill="black"/>
    <rect x="96" y="79" width="34.6988" height="97.5904" fill="white"/>
    <rect x="203.133" y="79" width="36.8675" height="97.5904" fill="white"/>
    <rect x="238.916" y="79" width="31.4458" height="69.6144" transform="rotate(90 238.916 79)" fill="white"/>
    <rect x="240" y="145.145" width="31.4458" height="70.6988" transform="rotate(90 240 145.145)" fill="white"/>
    <rect x="169.301" y="110.446" width="34.6988" height="38.6024" transform="rotate(90 169.301 110.446)" fill="white"/>
    <path d="M281.832 162V93.84H305.256C313.32 93.84 319.368 95.312 323.4 98.256C327.432 101.2 329.448 105.84 329.448 112.176C329.448 116.016 328.36 119.248 326.184 121.872C324.072 124.432 321.128 126.064 317.352 126.768C322.024 127.408 325.672 129.232 328.296 132.24C330.984 135.184 332.328 138.864 332.328 143.28C332.328 149.488 330.312 154.16 326.28 157.296C322.248 160.432 316.52 162 309.096 162H281.832ZM290.088 123.312H305.256C310.248 123.312 314.088 122.384 316.776 120.528C319.464 118.608 320.808 115.952 320.808 112.56C320.808 105.456 315.624 101.904 305.256 101.904H290.088V123.312ZM290.088 153.936H309.096C313.768 153.936 317.352 152.976 319.848 151.056C322.408 149.136 323.688 146.384 323.688 142.8C323.688 139.216 322.408 136.432 319.848 134.448C317.352 132.4 313.768 131.376 309.096 131.376H290.088V153.936ZM345.301 162V93.84H388.117V101.904H353.557V123.888H386.965V131.76H353.557V153.936H388.885V162H345.301ZM416.681 162V101.904H395.465V93.84H446.153V101.904H424.937V162H416.681ZM470.587 162V101.904H449.371V93.84H500.059V101.904H478.843V162H470.587ZM507.113 162V93.84H549.929V101.904H515.369V123.888H548.777V131.76H515.369V153.936H550.697V162H507.113ZM564.02 162V93.84H589.844C597.012 93.84 602.676 95.696 606.836 99.408C610.996 103.12 613.076 108.144 613.076 114.48C613.076 117.104 612.532 119.504 611.444 121.68C610.356 123.792 608.948 125.584 607.22 127.056C605.492 128.528 603.604 129.552 601.556 130.128C604.564 130.64 606.932 131.856 608.66 133.776C610.452 135.696 611.508 138.416 611.828 141.936L613.748 162H605.396L603.667 142.8C603.412 139.984 602.388 137.904 600.596 136.56C598.868 135.216 596.02 134.544 592.052 134.544H572.276V162H564.02ZM572.276 126.48H590.9C595.06 126.48 598.356 125.424 600.788 123.312C603.22 121.2 604.436 118.192 604.436 114.288C604.436 110.32 603.188 107.28 600.692 105.168C598.196 102.992 594.58 101.904 589.844 101.904H572.276V126.48ZM623.912 137.808V130.224H655.688V137.808H623.912ZM661.826 162L686.402 93.84H697.538L722.114 162H713.09L706.274 142.608H677.666L670.85 162H661.826ZM680.45 134.544H703.49L691.97 101.04L680.45 134.544ZM755.651 163.536C750.403 163.536 745.827 162.512 741.923 160.464C738.083 158.416 735.107 155.504 732.995 151.728C730.947 147.888 729.923 143.376 729.923 138.192V93.744H738.179V138.192C738.179 143.696 739.683 147.952 742.691 150.96C745.763 153.968 750.083 155.472 755.651 155.472C761.155 155.472 765.411 153.968 768.419 150.96C771.491 147.952 773.027 143.696 773.027 138.192V93.744H781.283V138.192C781.283 143.376 780.227 147.888 778.115 151.728C776.067 155.504 773.123 158.416 769.283 160.464C765.443 162.512 760.899 163.536 755.651 163.536ZM811.087 162V101.904H789.871V93.84H840.559V101.904H819.343V162H811.087ZM847.613 162V93.84H855.869V123.696H890.141V93.84H898.397V162H890.141V131.76H855.869V162H847.613ZM911.443 162V151.152H922.291V162H911.443Z" fill="white"/>
    </svg>
    `,
	whiteWordmark: `
      <svg width="1024" height="256" viewBox="0 0 1024 256" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="1024" height="256" fill="#FFEAEA"/>
      <rect x="96" y="79" width="34.6988" height="97.5904" fill="black"/>
      <rect x="203.133" y="79" width="36.8675" height="97.5904" fill="black"/>
      <rect x="238.916" y="79" width="31.4458" height="69.6144" transform="rotate(90 238.916 79)" fill="black"/>
      <rect x="240" y="145.145" width="31.4458" height="70.6988" transform="rotate(90 240 145.145)" fill="black"/>
      <rect x="169.301" y="110.446" width="34.6988" height="38.6024" transform="rotate(90 169.301 110.446)" fill="black"/>
      <path d="M281.832 162V93.84H305.256C313.32 93.84 319.368 95.312 323.4 98.256C327.432 101.2 329.448 105.84 329.448 112.176C329.448 116.016 328.36 119.248 326.184 121.872C324.072 124.432 321.128 126.064 317.352 126.768C322.024 127.408 325.672 129.232 328.296 132.24C330.984 135.184 332.328 138.864 332.328 143.28C332.328 149.488 330.312 154.16 326.28 157.296C322.248 160.432 316.52 162 309.096 162H281.832ZM290.088 123.312H305.256C310.248 123.312 314.088 122.384 316.776 120.528C319.464 118.608 320.808 115.952 320.808 112.56C320.808 105.456 315.624 101.904 305.256 101.904H290.088V123.312ZM290.088 153.936H309.096C313.768 153.936 317.352 152.976 319.848 151.056C322.408 149.136 323.688 146.384 323.688 142.8C323.688 139.216 322.408 136.432 319.848 134.448C317.352 132.4 313.768 131.376 309.096 131.376H290.088V153.936ZM345.301 162V93.84H388.117V101.904H353.557V123.888H386.965V131.76H353.557V153.936H388.885V162H345.301ZM416.681 162V101.904H395.465V93.84H446.153V101.904H424.937V162H416.681ZM470.587 162V101.904H449.371V93.84H500.059V101.904H478.843V162H470.587ZM507.113 162V93.84H549.929V101.904H515.369V123.888H548.777V131.76H515.369V153.936H550.697V162H507.113ZM564.02 162V93.84H589.844C597.012 93.84 602.676 95.696 606.836 99.408C610.996 103.12 613.076 108.144 613.076 114.48C613.076 117.104 612.532 119.504 611.444 121.68C610.356 123.792 608.948 125.584 607.22 127.056C605.492 128.528 603.604 129.552 601.556 130.128C604.564 130.64 606.932 131.856 608.66 133.776C610.452 135.696 611.508 138.416 611.828 141.936L613.748 162H605.396L603.667 142.8C603.412 139.984 602.388 137.904 600.596 136.56C598.868 135.216 596.02 134.544 592.052 134.544H572.276V162H564.02ZM572.276 126.48H590.9C595.06 126.48 598.356 125.424 600.788 123.312C603.22 121.2 604.436 118.192 604.436 114.288C604.436 110.32 603.188 107.28 600.692 105.168C598.196 102.992 594.58 101.904 589.844 101.904H572.276V126.48ZM623.912 137.808V130.224H655.688V137.808H623.912ZM661.826 162L686.402 93.84H697.538L722.114 162H713.09L706.274 142.608H677.666L670.85 162H661.826ZM680.45 134.544H703.49L691.97 101.04L680.45 134.544ZM755.651 163.536C750.403 163.536 745.827 162.512 741.923 160.464C738.083 158.416 735.107 155.504 732.995 151.728C730.947 147.888 729.923 143.376 729.923 138.192V93.744H738.179V138.192C738.179 143.696 739.683 147.952 742.691 150.96C745.763 153.968 750.083 155.472 755.651 155.472C761.155 155.472 765.411 153.968 768.419 150.96C771.491 147.952 773.027 143.696 773.027 138.192V93.744H781.283V138.192C781.283 143.376 780.227 147.888 778.115 151.728C776.067 155.504 773.123 158.416 769.283 160.464C765.443 162.512 760.899 163.536 755.651 163.536ZM811.087 162V101.904H789.871V93.84H840.559V101.904H819.343V162H811.087ZM847.613 162V93.84H855.869V123.696H890.141V93.84H898.397V162H890.141V131.76H855.869V162H847.613ZM911.443 162V151.152H922.291V162H911.443Z" fill="black"/>
      </svg>
      `,
	darkPng: DarkPng,
	whitePng: WhitePng,
};

export function StaggeredNavFiles() {
	const pathname = usePathname() || "/";
	const currentVersion = getVersionFromPathname(pathname);
	const prefixHref = (href: string) => versionedDocsHref(href, currentVersion);
	const [resourcesOpen, setResourcesOpen] = useState(false);
	const [productsOpen, setProductsOpen] = useState(false);
	const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
	const [mobileView, setMobileView] = useState<"docs" | "nav">("docs");
	const [mobileDocSection, setMobileDocSection] = useState(-1);
	const resourcesTimeout = useRef<NodeJS.Timeout>(undefined);
	const productsTimeout = useRef<NodeJS.Timeout>(undefined);

	useEffect(() => {
		document.body.style.overflow = mobileMenuOpen ? "hidden" : "";
		return () => {
			document.body.style.overflow = "";
		};
	}, [mobileMenuOpen]);

	useEffect(() => {
		const mql = window.matchMedia("(min-width: 1024px)");
		const handler = () => {
			if (mql.matches) {
				setMobileMenuOpen(false);
			}
		};
		mql.addEventListener("change", handler);
		return () => mql.removeEventListener("change", handler);
	}, []);

	const openResources = () => {
		clearTimeout(resourcesTimeout.current);
		setResourcesOpen(true);
	};
	const closeResources = () => {
		resourcesTimeout.current = setTimeout(() => setResourcesOpen(false), 150);
	};
	const openProducts = () => {
		clearTimeout(productsTimeout.current);
		setProductsOpen(true);
	};
	const closeProducts = () => {
		productsTimeout.current = setTimeout(() => setProductsOpen(false), 150);
	};
	const isActive = useCallback((href: string) => pathname === href, [pathname]);
	const isActivePrefix = useCallback(
		(href: string) => pathname === href || pathname.startsWith(`${href}/`),
		[pathname],
	);
	const isDocs = pathname.startsWith("/docs");
	const isPricingPage = pathname === "/pricing";
	const isResourcePage = resourceFiles.some((r) => {
		const matchPath = r.path || r.href;
		return pathname === matchPath || pathname.startsWith(`${matchPath}/`);
	});
	const isKnownPage =
		isActive("/") ||
		isDocs ||
		isPricingPage ||
		isResourcePage ||
		isActive("/enterprise");
	const isNarrowLeft = isDocs;
	const leftPaneWidthClass = isNarrowLeft
		? "w-[22vw] max-w-[300px]"
		: isPricingPage || isResourcePage
			? "w-[30%]"
			: "w-[40%]";
	const navBottomBorderClass = isNarrowLeft ? "border-foreground/5" : "";
	const tabDividerClass = isNarrowLeft
		? "border-foreground/4"
		: "border-foreground/[0.06]";
	const activeTabBorderClass = isNarrowLeft
		? "border-b-foreground/50"
		: "border-b-foreground/60";
	const dropdownBorderClass = isNarrowLeft
		? "border-foreground/6"
		: "border-foreground/[0.08]";
	const _router = useRouter();
	return (
		<>
			<div className="fixed top-0 left-0 right-0 z-[99] flex items-start pointer-events-none">
				{/* Left — Logo */}
				<motion.div
					initial={{ x: -20, opacity: 0 }}
					animate={{ x: 0, opacity: 1 }}
					transition={{ duration: 0.28, ease: "easeOut" }}
					className={`${leftPaneWidthClass} hidden ${isKnownPage ? "lg:flex" : "lg:hidden"} h-(--landing-topbar-height) items-stretch shrink-0 pointer-events-auto transition-[width] duration-300 ease-out`}
				>
					<Link
						href="/"
						className="flex h-full items-center gap-1 px-4 py-3 transition-colors duration-150"
					>
						<div className="flex flex-col gap-2 w-full">
							<LogoContextMenu
								logo={
									<div className="flex items-center gap-1">
										<Logo className="h-3 w-auto shrink-0" />
										<p className="select-none font-mono text-base uppercase leading-none">
											BETTER-AUTH.
										</p>
									</div>
								}
								logoAssets={logoAssets}
							/>
						</div>
					</Link>
				</motion.div>

				{/* Mobile — Logo + hamburger */}
				<motion.div
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					transition={{ duration: 0.28, ease: "easeOut" }}
					className="lg:hidden flex items-center justify-between w-full h-(--landing-topbar-height) pointer-events-auto bg-background border-b border-foreground/[0.06]"
				>
					<Link
						href="/"
						className="flex h-full items-center gap-1 px-4 transition-colors duration-150"
					>
						<Logo className="h-3 w-auto shrink-0" />
						<p className="select-none font-mono text-sm uppercase leading-none">
							BETTER-AUTH.
						</p>
					</Link>
					<div className="flex items-center gap-1 pr-2">
						{isDocs && (
							<button
								type="button"
								onClick={() => {
									window.dispatchEvent(
										new KeyboardEvent("keydown", {
											key: "k",
											metaKey: true,
											bubbles: true,
										}),
									);
								}}
								className="flex items-center justify-center size-8 text-foreground/50 hover:text-foreground/80 transition-colors"
								aria-label="Search"
							>
								<Search className="size-4" />
							</button>
						)}
						<div className="flex items-center justify-center size-8 text-foreground/50 [&_button]:text-foreground/50 [&_button:hover]:text-foreground/80">
							<ThemeToggle />
						</div>
						<button
							type="button"
							onClick={() => {
								const opening = !mobileMenuOpen;
								setMobileMenuOpen(opening);
								if (opening) {
									setMobileView(isDocs ? "docs" : "nav");
									if (isDocs) {
										const idx = contents.findIndex((s) => {
											const prefix = s.expandSectionForPathPrefix;
											if (
												prefix &&
												(pathname === prefix ||
													pathname.startsWith(`${prefix}/`))
											) {
												return true;
											}
											return s.list.some(
												(l) =>
													l.href === pathname ||
													(l.subpages?.length &&
														pathname.startsWith(`${l.href}/`)),
											);
										});
										setMobileDocSection(idx === -1 ? 0 : idx);
									}
								}
							}}
							className="flex items-center justify-center size-8 text-foreground/75 dark:text-foreground/60 hover:text-foreground/85 transition-colors"
						>
							{mobileMenuOpen ? (
								<svg
									xmlns="http://www.w3.org/2000/svg"
									width="18"
									height="18"
									viewBox="0 0 24 24"
								>
									<path
										fill="currentColor"
										d="M19 6.41L17.59 5L12 10.59L6.41 5L5 6.41L10.59 12L5 17.59L6.41 19L12 13.41L17.59 19L19 17.59L13.41 12z"
									/>
								</svg>
							) : (
								<svg
									xmlns="http://www.w3.org/2000/svg"
									width="18"
									height="18"
									viewBox="0 0 24 24"
								>
									<path
										fill="currentColor"
										d="M3 18h18v-2H3zm0-5h18v-2H3zm0-7v2h18V6z"
									/>
								</svg>
							)}
						</button>
					</div>
				</motion.div>

				{/* Right — Nav tabs (desktop) */}
				<motion.div
					initial={{ y: -10, opacity: 0 }}
					animate={{ y: 0, opacity: 1 }}
					transition={{ duration: 0.28, delay: 0.04, ease: "easeOut" }}
					className={`flex-1 hidden lg:flex h-[calc(var(--landing-topbar-height)+1px)] items-stretch border-b bg-background pointer-events-auto min-w-0 ${navBottomBorderClass}`}
				>
					{/* Inline logo when left pane is hidden */}
					{!isKnownPage && (
						<Link
							href="/"
							className={`flex h-full items-center gap-1 shrink-0 px-4 lg:px-7 py-3 border-r ${tabDividerClass} transition-colors duration-150`}
						>
							<LogoContextMenu
								logo={
									<div className="flex items-center gap-1">
										<Logo className="h-3 w-auto shrink-0" />
										<p className="select-none font-mono text-base uppercase leading-none">
											BETTER-AUTH.
										</p>
									</div>
								}
								logoAssets={logoAssets}
							/>
						</Link>
					)}
					{/* File tabs */}
					{navFiles.map((item, index) => {
						const active =
							isActive(item.path || item.href) ||
							(item.href === "/docs" && isDocs);
						return (
							<motion.div
								key={item.name}
								initial={{ opacity: 0, y: -4 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{
									duration: 0.2,
									delay: 0.05 + index * 0.03,
									ease: "easeOut",
								}}
								className="flex-1"
							>
								<Link
									href={item.href}
									target={item.external ? "_blank" : undefined}
									rel={item.external ? "noreferrer" : undefined}
									className={`group/tab relative flex items-center justify-center gap-1.5 px-2 xl:px-4 py-3 h-full border-r ${tabDividerClass} transition-colors duration-150 ${
										active
											? `bg-background border-b-2 ${activeTabBorderClass}`
											: "bg-transparent hover:bg-foreground/[0.03]"
									}`}
								>
									<span
										className={`font-mono text-xs uppercase tracking-wider transition-colors duration-150 whitespace-nowrap ${
											active
												? "text-foreground"
												: "text-foreground/65 dark:text-foreground/50 group-hover/tab:text-foreground/75"
										}`}
									>
										{item.name}
									</span>
								</Link>
							</motion.div>
						);
					})}

					{/* Products mega-menu tab */}
					<motion.div
						initial={{ opacity: 0, y: -4 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.2, delay: 0.125, ease: "easeOut" }}
						className="relative flex-1"
						onMouseEnter={openProducts}
						onMouseLeave={closeProducts}
					>
						<div
							className={`group/tab flex items-center justify-center gap-1.5 px-2 xl:px-4 py-3 h-full cursor-pointer border-r ${tabDividerClass} transition-colors duration-150 ${
								productsOpen
									? "bg-foreground/[0.04]"
									: "hover:bg-foreground/[0.03]"
							}`}
						>
							<span
								className={`font-mono text-xs uppercase tracking-wider transition-colors duration-150 whitespace-nowrap ${
									productsOpen
										? "text-foreground/80"
										: "text-foreground/65 dark:text-foreground/50 group-hover/tab:text-foreground/75"
								}`}
							>
								products
							</span>
							<svg
								className={`h-2 w-2 text-foreground/55 dark:text-foreground/40 transition-transform duration-200 ${
									productsOpen ? "rotate-180" : ""
								}`}
								viewBox="0 0 10 6"
								fill="none"
							>
								<path
									d="M1 1L5 5L9 1"
									stroke="currentColor"
									strokeWidth="1.2"
								/>
							</svg>
						</div>

						<AnimatePresence>
							{productsOpen && (
								<motion.div
									initial={{ opacity: 0, y: -4 }}
									animate={{ opacity: 1, y: 0 }}
									exit={{ opacity: 0, y: -4 }}
									transition={{ duration: 0.12, ease: "easeOut" }}
									className={`absolute top-full left-0 z-50 w-[340px] max-w-[calc(100vw-2rem)] border ${dropdownBorderClass} bg-background shadow-2xl shadow-black/20 dark:shadow-black/60`}
								>
									<div className="flex flex-col divide-y divide-foreground/[0.06]">
										{products.map((p) => (
											<Link
												key={p.title}
												href={p.href}
												onClick={() => setProductsOpen(false)}
												className="group/p relative flex h-full flex-col gap-2.5 p-4 overflow-hidden hover:bg-foreground/[0.03] transition-colors"
											>
												{p.BgPattern && (
													<p.BgPattern className={p.bgPatternClassName ?? ""} />
												)}
												{p.Pattern && (
													<p.Pattern
														className={
															p.patternClassName ??
															"absolute right-0 top-0 text-foreground/[0.09] group-hover/p:text-foreground/25 transition-colors duration-200 pointer-events-none"
														}
													/>
												)}
												<div className="relative flex items-center">
													<span className="flex size-8 items-center justify-center border border-foreground/[0.1] text-foreground/70 group-hover/p:text-foreground group-hover/p:border-foreground/25 transition-colors bg-background">
														<p.Icon className="size-4" />
													</span>
												</div>
												<div className="relative flex flex-col gap-0.5">
													<span className="text-[13px] font-medium text-foreground/90 group-hover/p:text-foreground transition-colors">
														{p.title}
													</span>
													<span className="text-[11px] leading-relaxed text-foreground/55 dark:text-foreground/45">
														{p.description}
													</span>
												</div>
											</Link>
										))}
									</div>
								</motion.div>
							)}
						</AnimatePresence>
					</motion.div>

					{/* Pricing tab */}
					<motion.div
						initial={{ opacity: 0, y: -4 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.2, delay: 0.14, ease: "easeOut" }}
						className="flex-1"
					>
						<Link
							href={pricingFile.href}
							className={`group/tab relative flex items-center justify-center gap-1.5 px-2 xl:px-4 py-3 h-full border-r ${tabDividerClass} transition-colors duration-150 ${
								isPricingPage
									? `bg-background border-b-2 ${activeTabBorderClass}`
									: "bg-transparent hover:bg-foreground/[0.03]"
							}`}
						>
							<span
								className={`font-mono text-xs uppercase tracking-wider transition-colors duration-150 whitespace-nowrap ${
									isPricingPage
										? "text-foreground"
										: "text-foreground/65 dark:text-foreground/50 group-hover/tab:text-foreground/75"
								}`}
							>
								{pricingFile.name}
							</span>
						</Link>
					</motion.div>

					{/* Enterprise tab */}
					<motion.div
						initial={{ opacity: 0, y: -4 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{
							duration: 0.2,
							delay: 0.155,
							ease: "easeOut",
						}}
						className="flex-1"
					>
						<Link
							href="/enterprise"
							className={`group/tab relative flex items-center justify-center gap-1.5 px-2 xl:px-4 py-3 h-full border-r ${tabDividerClass} transition-colors duration-150 ${
								isActive("/enterprise")
									? `bg-background border-b-2 ${activeTabBorderClass}`
									: "bg-transparent hover:bg-foreground/[0.03]"
							}`}
						>
							<span
								className={`font-mono text-xs uppercase tracking-wider transition-colors duration-150 whitespace-nowrap ${
									isActive("/enterprise")
										? "text-foreground"
										: "text-foreground/65 dark:text-foreground/50 group-hover/tab:text-foreground/75"
								}`}
							>
								enterprise
							</span>
						</Link>
					</motion.div>

					{/* Resources folder tab */}
					<motion.div
						initial={{ opacity: 0, y: -4 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.2, delay: 0.17, ease: "easeOut" }}
						className="relative flex-1"
						onMouseEnter={openResources}
						onMouseLeave={closeResources}
					>
						<div
							className={`group/tab flex items-center justify-center gap-1.5 px-2 xl:px-4 py-3 h-full cursor-pointer transition-colors duration-150 ${
								isResourcePage
									? `bg-background border-b-2 ${activeTabBorderClass}`
									: resourcesOpen
										? "bg-foreground/[0.04]"
										: "hover:bg-foreground/[0.03]"
							}`}
						>
							<span
								className={`font-mono text-xs uppercase tracking-wider transition-colors duration-150 whitespace-nowrap ${
									isResourcePage
										? "text-foreground"
										: resourcesOpen
											? "text-foreground/80"
											: "text-foreground/65 dark:text-foreground/50 group-hover/tab:text-foreground/75"
								}`}
							>
								resources
							</span>
							<svg
								className={`h-2 w-2 text-foreground/55 dark:text-foreground/40 transition-transform duration-200 ${
									resourcesOpen ? "rotate-180" : ""
								}`}
								viewBox="0 0 10 6"
								fill="none"
							>
								<path
									d="M1 1L5 5L9 1"
									stroke="currentColor"
									strokeWidth="1.2"
								/>
							</svg>
						</div>

						<AnimatePresence>
							{resourcesOpen && (
								<motion.div
									initial={{ opacity: 0, y: -4 }}
									animate={{ opacity: 1, y: 0 }}
									exit={{ opacity: 0, y: -4 }}
									transition={{ duration: 0.12, ease: "easeOut" }}
									className={`absolute top-full right-0 z-50 w-[480px] max-w-[calc(100vw-2rem)] border ${dropdownBorderClass} bg-background shadow-2xl shadow-black/20 dark:shadow-black/60`}
								>
									<div className="grid grid-cols-2 divide-x divide-foreground/[0.06]">
										{featuredResources.map((r) => (
											<Link
												key={r.title}
												href={r.href}
												onClick={() => setResourcesOpen(false)}
												className="group/p relative flex h-full flex-col gap-2.5 p-4 overflow-hidden hover:bg-foreground/[0.03] transition-colors"
											>
												{r.BgPattern && (
													<r.BgPattern className={r.bgPatternClassName ?? ""} />
												)}
												{r.Pattern && (
													<r.Pattern
														className={
															r.patternClassName ??
															"absolute right-0 top-0 text-foreground/[0.09] group-hover/p:text-foreground/25 transition-colors duration-200 pointer-events-none"
														}
													/>
												)}
												<div className="relative flex items-center">
													<span className="flex size-8 items-center justify-center border border-foreground/[0.1] text-foreground/70 group-hover/p:text-foreground group-hover/p:border-foreground/25 transition-colors bg-background">
														<r.Icon className="size-4" />
													</span>
												</div>
												<div className="relative flex flex-col gap-0.5">
													<span className="text-[13px] font-medium text-foreground/90 group-hover/p:text-foreground transition-colors">
														{r.title}
													</span>
													<span className="text-[11px] leading-relaxed text-foreground/55 dark:text-foreground/45">
														{r.description}
													</span>
												</div>
											</Link>
										))}
									</div>
									<div className="grid grid-cols-4 divide-x divide-foreground/[0.06] border-t border-foreground/[0.06]">
										{linkResources.map((r) => (
											<Link
												key={r.title}
												href={r.href}
												onClick={() => setResourcesOpen(false)}
												className="group/p relative flex items-center gap-2 px-3 py-3 hover:bg-foreground/[0.03] transition-colors"
											>
												<r.Icon className="size-3.5 text-foreground/55 group-hover/p:text-foreground/80 transition-colors" />
												<span className="text-[12px] font-medium text-foreground/75 group-hover/p:text-foreground transition-colors">
													{r.title}
												</span>
											</Link>
										))}
									</div>
									<div className="grid w-full grid-cols-[repeat(auto-fit,minmax(1.75rem,1fr))] items-center justify-items-center gap-y-0.5 border-t border-foreground/[0.06] px-2 py-2">
										<a
											href="https://github.com/better-auth/better-auth"
											target="_blank"
											rel="noreferrer"
											className="flex items-center justify-center p-1 text-foreground/55 dark:text-foreground/40 hover:text-foreground/75 transition-colors"
											aria-label="GitHub"
										>
											<svg
												xmlns="http://www.w3.org/2000/svg"
												width="14"
												height="14"
												viewBox="0 0 256 250"
											>
												<path
													fill="currentColor"
													d="M128.001 0C57.317 0 0 57.307 0 128.001c0 56.554 36.676 104.535 87.535 121.46c6.397 1.185 8.746-2.777 8.746-6.158c0-3.052-.12-13.135-.174-23.83c-35.61 7.742-43.124-15.103-43.124-15.103c-5.823-14.795-14.213-18.73-14.213-18.73c-11.613-7.944.876-7.78.876-7.78c12.853.902 19.621 13.19 19.621 13.19c11.417 19.568 29.945 13.911 37.249 10.64c1.149-8.272 4.466-13.92 8.127-17.116c-28.431-3.236-58.318-14.212-58.318-63.258c0-13.975 5-25.394 13.188-34.358c-1.329-3.224-5.71-16.242 1.24-33.874c0 0 10.749-3.44 35.21 13.121c10.21-2.836 21.16-4.258 32.038-4.307c10.878.049 21.837 1.47 32.066 4.307c24.431-16.56 35.165-13.12 35.165-13.12c6.967 17.63 2.584 30.65 1.255 33.873c8.207 8.964 13.173 20.383 13.173 34.358c0 49.163-29.944 59.988-58.447 63.157c4.591 3.972 8.682 11.762 8.682 23.704c0 17.126-.148 30.91-.148 35.126c0 3.407 2.304 7.398 8.792 6.14C219.37 232.5 256 184.537 256 128.002C256 57.307 198.691 0 128.001 0"
												/>
											</svg>
										</a>
										<a
											href="https://discord.gg/better-auth"
											target="_blank"
											rel="noreferrer"
											className="flex items-center justify-center p-1 text-foreground/55 dark:text-foreground/40 hover:text-foreground/75 transition-colors"
											aria-label="Discord"
										>
											<svg
												xmlns="http://www.w3.org/2000/svg"
												width="14"
												height="14"
												viewBox="0 0 24 24"
											>
												<path
													fill="currentColor"
													d="M19.303 5.337A17.3 17.3 0 0 0 14.963 4c-.191.329-.403.775-.552 1.125a16.6 16.6 0 0 0-4.808 0C9.454 4.775 9.23 4.329 9.05 4a17 17 0 0 0-4.342 1.337C1.961 9.391 1.218 13.35 1.59 17.255a17.7 17.7 0 0 0 5.318 2.664a13 13 0 0 0 1.136-1.836c-.627-.234-1.22-.52-1.794-.86c.149-.106.297-.223.435-.34c3.46 1.582 7.207 1.582 10.624 0c.149.117.287.234.435.34c-.573.34-1.167.626-1.793.86a13 13 0 0 0 1.135 1.836a17.6 17.6 0 0 0 5.318-2.664c.457-4.52-.722-8.448-3.1-11.918M8.52 14.846c-1.04 0-1.889-.945-1.889-2.101s.828-2.102 1.89-2.102c1.05 0 1.91.945 1.888 2.102c0 1.156-.838 2.1-1.889 2.1m6.974 0c-1.04 0-1.89-.945-1.89-2.101s.828-2.102 1.89-2.102c1.05 0 1.91.945 1.889 2.102c0 1.156-.828 2.1-1.89 2.1"
												/>
											</svg>
										</a>
										<a
											href="https://reddit.com/r/better_auth"
											target="_blank"
											rel="noreferrer"
											className="flex items-center justify-center p-1 text-foreground/55 dark:text-foreground/40 hover:text-foreground/75 transition-colors"
											aria-label="Reddit"
										>
											<svg
												xmlns="http://www.w3.org/2000/svg"
												width="14"
												height="14"
												viewBox="0 0 256 256"
											>
												<circle cx="128" cy="128" r="128" fill="currentColor" />
												<path
													fill="currentColor"
													className="text-background"
													d="M213.15 129.22c0-10.376-8.391-18.617-18.617-18.617a18.74 18.74 0 0 0-12.97 5.189c-12.818-9.157-30.368-15.107-49.9-15.87l8.544-39.981l27.773 5.95c.307 7.02 6.104 12.667 13.278 12.667c7.324 0 13.275-5.95 13.275-13.278c0-7.324-5.95-13.275-13.275-13.275c-5.188 0-9.768 3.052-11.904 7.478l-30.976-6.562c-.916-.154-1.832 0-2.443.458c-.763.458-1.22 1.22-1.371 2.136l-9.464 44.558c-19.837.612-37.692 6.562-50.662 15.872a18.74 18.74 0 0 0-12.971-5.188c-10.377 0-18.617 8.391-18.617 18.617c0 7.629 4.577 14.037 10.988 16.939a33.6 33.6 0 0 0-.458 5.646c0 28.686 33.42 52.036 74.621 52.036c41.202 0 74.622-23.196 74.622-52.036a35 35 0 0 0-.458-5.646c6.408-2.902 10.985-9.464 10.985-17.093M85.272 142.495c0-7.324 5.95-13.275 13.278-13.275c7.324 0 13.275 5.95 13.275 13.275s-5.95 13.278-13.275 13.278c-7.327.15-13.278-5.953-13.278-13.278m74.317 35.251c-9.156 9.157-26.553 9.768-31.588 9.768c-5.188 0-22.584-.765-31.59-9.768c-1.371-1.373-1.371-3.51 0-4.883c1.374-1.371 3.51-1.371 4.884 0c5.8 5.8 18.008 7.782 26.706 7.782s21.058-1.983 26.704-7.782c1.374-1.371 3.51-1.371 4.884 0c1.22 1.373 1.22 3.51 0 4.883m-2.443-21.822c-7.325 0-13.275-5.95-13.275-13.275s5.95-13.275 13.275-13.275c7.327 0 13.277 5.95 13.277 13.275c0 7.17-5.95 13.275-13.277 13.275"
												/>
											</svg>
										</a>
										<a
											href="https://x.com/better_auth"
											target="_blank"
											rel="noreferrer"
											className="flex items-center justify-center p-1 text-foreground/55 dark:text-foreground/40 hover:text-foreground/75 transition-colors"
											aria-label="X"
										>
											<svg
												xmlns="http://www.w3.org/2000/svg"
												width="14"
												height="14"
												viewBox="0 0 24 24"
											>
												<path
													fill="currentColor"
													d="m17.687 3.063l-4.996 5.711l-4.32-5.711H2.112l7.477 9.776l-7.086 8.099h3.034l5.469-6.25l4.78 6.25h6.102l-7.794-10.304l6.625-7.571zm-1.064 16.06L5.654 4.782h1.803l10.846 14.34z"
												/>
											</svg>
										</a>
										<a
											href="https://www.npmjs.com/package/better-auth"
											target="_blank"
											rel="noreferrer"
											className="flex items-center justify-center p-1 text-foreground/55 dark:text-foreground/40 hover:text-foreground/75 transition-colors"
											aria-label="npm"
										>
											<svg
												xmlns="http://www.w3.org/2000/svg"
												width="14"
												height="14"
												viewBox="0 0 128 128"
											>
												<path
													fill="#cb3837"
													d="M0 7.062C0 3.225 3.225 0 7.062 0h113.88c3.838 0 7.063 3.225 7.063 7.062v113.88c0 3.838-3.225 7.063-7.063 7.063H7.062c-3.837 0-7.062-3.225-7.062-7.063zm23.69 97.518h40.395l.05-58.532h19.494l-.05 58.581h19.543l.05-78.075l-78.075-.1l-.1 78.126z"
												/>
												<path
													fill="#fff"
													d="M25.105 65.52V26.512H40.96c8.72 0 26.274.034 39.008.075l23.153.075v77.866H83.645v-58.54H64.057v58.54H25.105z"
												/>
											</svg>
										</a>
									</div>
								</motion.div>
							)}
						</AnimatePresence>
					</motion.div>
					{/* Get Started CTA — always visible */}
					<motion.div
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						transition={{ duration: 0.2, delay: 0.2, ease: "easeOut" }}
						className="flex items-stretch shrink-0"
					>
						<a
							href="https://dash.better-auth.com/sign-in"
							className="flex items-center cursor-pointer gap-1.5 px-5 py-3 bg-foreground text-background hover:opacity-90 transition-colors duration-150"
						>
							<span className="font-mono text-xs uppercase tracking-wider">
								sign-in
							</span>
							<svg
								className="h-2.5 w-2.5 opacity-50"
								viewBox="0 0 10 10"
								fill="none"
							>
								<path
									d="M1 9L9 1M9 1H3M9 1V7"
									stroke="currentColor"
									strokeWidth="1.2"
								/>
							</svg>
						</a>
					</motion.div>
				</motion.div>
			</div>

			{/* Mobile menu overlay */}
			<AnimatePresence>
				{mobileMenuOpen && (
					<motion.div
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.15 }}
						className="lg:hidden fixed inset-0 z-[98] w-full bg-background/95 backdrop-blur-sm pointer-events-auto"
					>
						<div className="flex h-full flex-col pt-(--landing-topbar-height)">
							<div className="flex-1 min-h-0 overflow-y-auto">
								{isDocs && mobileView === "docs" ? (
									<>
										{/* Subtle back to nav button */}
										<button
											type="button"
											onClick={() => setMobileView("nav")}
											className="flex items-center gap-2 w-full px-5 py-2.5 text-foreground/65 dark:text-foreground/45 hover:text-foreground/70 transition-colors border-b border-foreground/6"
										>
											<svg
												xmlns="http://www.w3.org/2000/svg"
												width="12"
												height="12"
												viewBox="0 0 24 24"
											>
												<path
													fill="currentColor"
													d="M3 18h18v-2H3zm0-5h18v-2H3zm0-7v2h18V6z"
												/>
											</svg>
											<span className="font-mono text-[10px] uppercase tracking-wider">
												Menu
											</span>
										</button>

										{/* Doc sidebar sections */}

										<div className="flex flex-col">
											{contents.map((section, index) => (
												<div key={section.title}>
													<button
														type="button"
														className={cn(
															"border-b border-foreground/6 w-full text-left flex gap-2 items-center px-5 py-3 transition-colors",
															"font-medium text-sm tracking-wider",
															mobileDocSection === index
																? "text-foreground bg-foreground/3"
																: "text-foreground/70 hover:text-foreground hover:bg-foreground/3",
														)}
														onClick={() =>
															setMobileDocSection((prev) =>
																prev === index ? -1 : index,
															)
														}
													>
														<section.Icon className="size-4.5" />
														<span className="grow">{section.title}</span>
														<ChevronDownIcon
															className={cn(
																"h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
																mobileDocSection === index ? "rotate-180" : "",
															)}
														/>
													</button>
													{mobileDocSection === index && (
														<div className="relative overflow-hidden">
															<div className="text-sm pt-0 pb-1">
																{section.href && (
																	<Link
																		href={prefixHref(section.href)}
																		onClick={() => setMobileMenuOpen(false)}
																		data-active={
																			pathname === section.href || undefined
																		}
																		className={cn(
																			"relative flex items-center gap-2.5 px-5 py-1.5 text-[14px] transition-all duration-150",
																			pathname === section.href
																				? "text-foreground bg-foreground/6"
																				: "text-foreground/75 dark:text-foreground/60 hover:text-foreground/90 hover:bg-foreground/3",
																		)}
																	>
																		<span className="truncate">Overview</span>
																	</Link>
																)}
																{section.list.map((item, i) => {
																	if (item.separator || item.group) {
																		return (
																			<div
																				key={`sep-${item.title}-${i}`}
																				className="flex flex-row items-center gap-2 mx-5 my-2"
																			>
																				<p className="text-[10px] text-foreground/65 dark:text-foreground/45 uppercase tracking-wider">
																					{item.title}
																				</p>
																				<div className="grow h-px bg-border" />
																			</div>
																		);
																	}
																	if (item.external && item.href) {
																		return (
																			<Link
																				key={item.href}
																				href={item.href}
																				onClick={() => setMobileMenuOpen(false)}
																				className={cn(
																					"relative flex w-full items-center gap-2.5 px-5 py-1.5 text-[14px] transition-all duration-150",
																					"text-foreground/75 dark:text-foreground/60 hover:text-foreground/90 hover:bg-foreground/3",
																				)}
																			>
																				<span className="text-foreground/75 transition-colors duration-150 dark:text-foreground/60">
																					<span className="flex size-5 shrink-0 items-center justify-center [&>svg]:size-[14px]">
																						<item.icon className="text-foreground/75" />
																					</span>
																				</span>
																				<span className="min-w-0 grow truncate">
																					{item.title}
																				</span>
																				{item.isNew && (
																					<Badge
																						className="pointer-events-none border-dashed rounded-none px-1.5 py-0 text-[9px] uppercase tracking-wider text-foreground/70 dark:text-foreground/55 border-foreground/25"
																						variant="outline"
																					>
																						New
																					</Badge>
																				)}
																			</Link>
																		);
																	}
																	if (!item.href) return null;
																	const active =
																		pathname === item.href ||
																		(!!item.subpages?.length &&
																			pathname.startsWith(`${item.href}/`));
																	return (
																		<Link
																			key={item.href}
																			href={prefixHref(item.href)}
																			onClick={() => setMobileMenuOpen(false)}
																			data-active={active || undefined}
																			className={cn(
																				"relative flex w-full items-center gap-2.5 px-5 py-1.5 text-[14px] transition-all duration-150",
																				active
																					? "text-foreground bg-foreground/6"
																					: "text-foreground/75 dark:text-foreground/60 hover:text-foreground/90 hover:bg-foreground/3",
																			)}
																		>
																			<span
																				className={cn(
																					"transition-colors duration-150",
																					active
																						? "text-foreground"
																						: "text-foreground/75 dark:text-foreground/60",
																				)}
																			>
																				<span className="flex size-5 shrink-0 items-center justify-center [&>svg]:size-[14px]">
																					<item.icon className="text-foreground/75" />
																				</span>
																			</span>
																			<span className="min-w-0 grow truncate">
																				{item.title}
																			</span>
																			{item.isNew && (
																				<Badge
																					className={cn(
																						"pointer-events-none border-dashed rounded-none px-1.5 py-0 text-[9px] uppercase tracking-wider",
																						active
																							? "border-solid bg-foreground/10 text-foreground"
																							: "text-foreground/70 dark:text-foreground/55 border-foreground/25",
																					)}
																					variant="outline"
																				>
																					New
																				</Badge>
																			)}
																		</Link>
																	);
																})}
															</div>
														</div>
													)}
												</div>
											))}
										</div>
									</>
								) : (
									<>
										{/* Back to docs button (when on docs page and switched to nav view) */}
										{isDocs && mobileView === "nav" && (
											<button
												type="button"
												onClick={() => setMobileView("docs")}
												className="flex items-center gap-2 w-full px-5 py-2.5 text-foreground/65 dark:text-foreground/45 hover:text-foreground/70 transition-colors border-b border-foreground/6"
											>
												<svg
													xmlns="http://www.w3.org/2000/svg"
													width="12"
													height="12"
													viewBox="0 0 24 24"
												>
													<path
														fill="currentColor"
														d="M20 11H7.83l5.59-5.59L12 4l-8 8l8 8l1.41-1.41L7.83 13H20z"
													/>
												</svg>
												<span className="font-mono text-[10px] uppercase tracking-wider">
													Docs
												</span>
											</button>
										)}

										{/* Nav items */}
										{navFiles.map((item) => (
											<Link
												key={item.name}
												href={item.href}
												onClick={() => setMobileMenuOpen(false)}
												className={cn(
													"flex items-center gap-2.5 px-5 py-3.5 border-b border-foreground/6 transition-colors font-mono text-base uppercase tracking-wider",
													isActive(item.path || item.href) ||
														(item.href === "/docs" && isDocs)
														? "text-foreground bg-foreground/4"
														: "text-foreground/75 dark:text-foreground/60 hover:bg-foreground/3",
												)}
											>
												{item.name}
											</Link>
										))}

										{/* Accordion groups */}
										<Accordion
											type="multiple"
											defaultValue={[
												...mobileMenuSections
													.filter((s) =>
														s.children?.some((item) =>
															isActivePrefix(item.path || item.href),
														),
													)
													.map((s) => s.name),
											]}
											className="w-full"
										>
											{mobileMenuSections.map((section) => (
												<AccordionItem
													key={section.name}
													value={section.name}
													className="border-foreground/6"
												>
													{section.children ? (
														<>
															<AccordionTrigger className="px-5 py-3.5 font-mono text-base uppercase tracking-wider text-foreground/75 dark:text-foreground/60 hover:text-foreground hover:no-underline">
																{section.name}
															</AccordionTrigger>
															<AccordionContent className="pb-0">
																{section.children.map((item) => (
																	<Link
																		key={item.name}
																		href={item.href}
																		target={
																			item.external ? "_blank" : undefined
																		}
																		rel={
																			item.external ? "noreferrer" : undefined
																		}
																		onClick={() => setMobileMenuOpen(false)}
																		className={cn(
																			"flex items-center gap-2.5 pl-9 pr-5 py-2.5 transition-colors font-mono text-sm uppercase tracking-wider",
																			isActivePrefix(item.path || item.href)
																				? "text-foreground bg-foreground/4"
																				: "text-foreground/60 dark:text-foreground/45 hover:text-foreground hover:bg-foreground/3",
																		)}
																	>
																		{item.name}
																	</Link>
																))}
															</AccordionContent>
														</>
													) : (
														<Link
															href={section.href!}
															onClick={() => setMobileMenuOpen(false)}
															className={cn(
																"flex items-center gap-2.5 px-5 py-3.5 transition-colors font-mono text-base uppercase tracking-wider",
																isActive(section.href!)
																	? "text-foreground bg-foreground/4"
																	: "text-foreground/75 dark:text-foreground/60 hover:text-foreground",
															)}
														>
															{section.name}
														</Link>
													)}
												</AccordionItem>
											))}
										</Accordion>
									</>
								)}
							</div>

							{/* Sticky footer with sign-in CTA */}
							{!(isDocs && mobileView === "docs") && (
								<div className="shrink-0 border-t border-foreground/[0.06] bg-background px-5 py-4">
									<a
										href="https://dash.better-auth.com/sign-in"
										onClick={() => setMobileMenuOpen(false)}
										className="flex items-center justify-center gap-1.5 w-full py-3 bg-foreground text-background font-mono text-sm uppercase tracking-wider transition-opacity hover:opacity-90"
									>
										sign-in
										<svg
											className="h-2.5 w-2.5 opacity-50"
											viewBox="0 0 10 10"
											fill="none"
										>
											<path
												d="M1 9L9 1M9 1H3M9 1V7"
												stroke="currentColor"
												strokeWidth="1.2"
											/>
										</svg>
									</a>
								</div>
							)}
						</div>
					</motion.div>
				)}
			</AnimatePresence>
		</>
	);
}
