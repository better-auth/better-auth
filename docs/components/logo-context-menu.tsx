"use client";

import type React from "react";
import { useState, useRef, useEffect } from "react";
import { Code, Download, Type } from "lucide-react";
import { toast } from "sonner";
import { useTheme } from "next-themes";
import type { StaticImageData } from "next/image";

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
  const [position, setPosition] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  const menuRef = useRef<HTMLDivElement>(null);
  const logoRef = useRef<HTMLDivElement>(null);
  const { theme } = useTheme();

  const handleContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    const rect = logoRef.current?.getBoundingClientRect();
    if (rect) {
      setPosition({
        x: e.clientX,
        y: e.clientY,
      });
      setShowMenu(true);
    }
  };

  const copySvgToClipboard = (svgContent: string, type: string) => {
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

  const downloadPng = (pngData: StaticImageData, fileName: string) => {
    const link = document.createElement("a");
    link.href = pngData.src;
    link.download = fileName;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast.success(`Downloading the asset...`);

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
          className="fixed ml-20 z-50 bg-white dark:bg-black border border-gray-200 dark:border-border rounded-sm shadow-xl w-fit overflow-hidden"
          style={{
            top: `${position.y}px`,
            left: `${position.x}px`,
            transform: "translate(-50%, 10px)",
          }}
        >
          <div className="">
            <h3 className="flex items-center pt-3 pl-4 h-6 text-black dark:text-white text-xs font-normal">
              Logo Assets
            </h3>
            <div className="border-b border-gray-200 dark:border-border my-2 mb-0"></div>
            <div className="flex p-0 gap-1 flex-col text-sm">
              <button
                onClick={() =>
                  copySvgToClipboard(
                    getAsset(logoAssets.darkSvg, logoAssets.whiteSvg),
                    "Logo SVG",
                  )
                }
                className="flex items-center gap-3 w-full p-2 text-black dark:text-white hover:bg-gray-100 dark:hover:bg-zinc-900 rounded-md transition-colors"
              >
                <Code className="h-4 w-4" />
                <span>Copy Logo as SVG </span>
              </button>

              <button
                onClick={() =>
                  copySvgToClipboard(
                    getAsset(logoAssets.darkWordmark, logoAssets.whiteWordmark),
                    "Logo Wordmark",
                  )
                }
                className="flex items-center gap-3 w-full p-2 text-black dark:text-white hover:bg-gray-100 dark:hover:bg-zinc-900 rounded-md transition-colors"
              >
                <Type className="h-4 w-4" />
                <span>Copy Logo as Wordmark </span>
              </button>

              <button
                onClick={() =>
                  downloadPng(
                    getAsset(logoAssets.darkPng, logoAssets.whitePng),
                    `better-auth-logo-${theme}.png`,
                  )
                }
                className="flex items-center gap-3 w-full p-2 text-black dark:text-white hover:bg-gray-100 dark:hover:bg-zinc-900 rounded-md transition-colors"
              >
                <Download className="h-4 w-4" />
                <span>Download Logo PNG</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
