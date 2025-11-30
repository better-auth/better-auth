"use client";

import { Code, Image, Type } from "lucide-react";
import type { StaticImageData } from "next/image";
import { useTheme } from "next-themes";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

interface LogoAssets {
	darkSvg: string;
	whiteSvg: string;
	darkWordmark: string;
	whiteWordmark: string;
	darkPng: StaticImageData;
	whitePng: StaticImageData;
}

interface ContextMenuProps {
	logo: React.ReactNode;
	logoAssets: LogoAssets;
}

export default function LogoContextMenu({
	logo,
	logoAssets,
}: ContextMenuProps) {
	const [showMenu, setShowMenu] = useState<boolean>(false);
	const menuRef = useRef<HTMLDivElement>(null);
	const logoRef = useRef<HTMLDivElement>(null);
	const { theme } = useTheme();

	const handleContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
		e.preventDefault();
		e.stopPropagation();
		const rect = logoRef.current?.getBoundingClientRect();
		if (rect) {
			setShowMenu(true);
		}
	};

	const copySvgToClipboard = (
		e: React.MouseEvent,
		svgContent: string,
		type: string,
	) => {
		e.preventDefault();
		e.stopPropagation();
		navigator.clipboard
			.writeText(svgContent)
			.then(() => {
				toast.success("", {
					description: `${type} copied to clipboard`,
				});
			})
			.catch((err) => {
				toast.error("", {
					description: `Failed to copy ${type} to clipboard`,
				});
			});
		setShowMenu(false);
	};

	const downloadPng = (
		e: React.MouseEvent,
		pngData: StaticImageData,
		fileName: string,
	) => {
		e.preventDefault();
		e.stopPropagation();
		const link = document.createElement("a");
		link.href = pngData.src;
		link.download = fileName;

		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);

		toast.success(`Downloading the asset...`);

		setShowMenu(false);
	};

	const downloadAllAssets = (e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		const link = document.createElement("a");
		link.href = "/branding/better-auth-brand-assets.zip";
		link.download = "better-auth-branding-assets.zip";

		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);

		toast.success("Downloading all assets...");
		setShowMenu(false);
	};

	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
				setShowMenu(false);
			}
		};

		document.addEventListener("mousedown", handleClickOutside);
		return () => {
			document.removeEventListener("mousedown", handleClickOutside);
		};
	}, []);

	const getAsset = <T,>(darkAsset: T, lightAsset: T): T => {
		return theme === "dark" ? darkAsset : lightAsset;
	};

	return (
		<div className="relative">
			<div
				ref={logoRef}
				onContextMenu={handleContextMenu}
				className="cursor-pointer"
			>
				{logo}
			</div>

			{showMenu && (
				<div
					ref={menuRef}
					className="fixed mx-10 z-50 bg-white dark:bg-black border border-gray-200 dark:border-border p-1 rounded-sm shadow-xl w-56 overflow-hidden animate-fd-dialog-in duration-500"
				>
					<div className="">
						<div className="flex p-0 gap-1 flex-col text-xs">
							<button
								onClick={(e) =>
									copySvgToClipboard(
										e,
										getAsset(logoAssets.darkSvg, logoAssets.whiteSvg),
										"Logo SVG",
									)
								}
								className="flex items-center gap-3 w-full p-2 text-black dark:text-white hover:bg-gray-100 dark:hover:bg-zinc-900 rounded-md transition-colors cursor-pointer"
							>
								<div className="flex items-center">
									<span className="text-gray-400 dark:text-zinc-400/30">[</span>

									<Code className="h-[13.8px] w-[13.8px] mx-[3px]" />
									<span className="text-gray-400 dark:text-zinc-400/30">]</span>
								</div>
								<span>Copy Logo as SVG </span>
							</button>
							<hr className="border-border/[60%]" />
							<button
								onClick={(e) =>
									copySvgToClipboard(
										e,
										getAsset(logoAssets.darkWordmark, logoAssets.whiteWordmark),
										"Logo Wordmark",
									)
								}
								className="flex items-center gap-3 w-full p-2 text-black dark:text-white hover:bg-gray-100 dark:hover:bg-zinc-900 rounded-md transition-colors cursor-pointer"
							>
								<div className="flex items-center">
									<span className="text-gray-400 dark:text-zinc-400/30">[</span>

									<Type className="h-[13.8px] w-[13.8px] mx-[3px]" />
									<span className="text-gray-400 dark:text-zinc-400/30">]</span>
								</div>
								<span>Copy Logo as Wordmark </span>
							</button>

							<hr className="border-border/[60%]" />
							<button
								onClick={(e) =>
									downloadPng(
										e,
										getAsset(logoAssets.darkPng, logoAssets.whitePng),
										`better-auth-logo-${theme}.png`,
									)
								}
								className="flex items-center gap-3 w-full p-2 text-black dark:text-white hover:bg-gray-100 dark:hover:bg-zinc-900 rounded-md transition-colors cursor-pointer"
							>
								<div className="flex items-center">
									<span className="text-gray-400 dark:text-zinc-400/30">[</span>

									<Image className="h-[13.8px] w-[13.8px] mx-[3px]" />
									<span className="text-gray-400 dark:text-zinc-400/30">]</span>
								</div>
								<span>Download Logo PNG</span>
							</button>
							<hr className="border-border" />
							<button
								onClick={(e) => downloadAllAssets(e)}
								className="flex items-center gap-3 w-full p-2 text-black dark:text-white hover:bg-gray-100 dark:hover:bg-zinc-900 rounded-md transition-colors cursor-pointer"
							>
								<div className="flex items-center">
									<span className="text-gray-400 dark:text-zinc-400/30">[</span>

									<svg
										xmlns="http://www.w3.org/2000/svg"
										width="1em"
										height="1em"
										viewBox="0 0 24 24"
										className="h-[13.8px] w-[13.8px] mx-[3px]"
									>
										<path
											fill="none"
											stroke="currentColor"
											strokeLinecap="round"
											strokeLinejoin="round"
											strokeWidth="2"
											d="M4 8v8.8c0 1.12 0 1.68.218 2.108a2 2 0 0 0 .874.874c.427.218.987.218 2.105.218h9.606c1.118 0 1.677 0 2.104-.218c.377-.192.683-.498.875-.874c.218-.428.218-.987.218-2.105V8M4 8h16M4 8l1.365-2.39c.335-.585.503-.878.738-1.092c.209-.189.456-.332.723-.42C7.13 4 7.466 4 8.143 4h7.714c.676 0 1.015 0 1.318.099c.267.087.513.23.721.42c.236.213.404.506.74 1.093L20 8m-8 3v6m0 0l3-2m-3 2l-3-2"
										></path>
									</svg>
									<span className="text-gray-400 dark:text-zinc-400/30">]</span>
								</div>
								<span>Brand Assets</span>
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
