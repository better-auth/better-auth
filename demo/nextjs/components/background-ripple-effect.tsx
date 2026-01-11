"use client";
import type React from "react";
import { useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export const BackgroundRippleEffect = ({
	rows = 8,
	cols = 27,
	cellSize = 56,
}: {
	rows?: number;
	cols?: number;
	cellSize?: number;
}) => {
	const [clickedCell, setClickedCell] = useState<{
		row: number;
		col: number;
	} | null>(null);
	const [rippleKey, setRippleKey] = useState(0);
	const ref = useRef<HTMLDivElement | null>(null);

	return (
		<div
			ref={ref}
			className={cn(
				"absolute inset-0 h-full w-full pointer-events-none",
				"[--cell-border-color:hsl(0_0%_85%)] [--cell-fill-color:hsl(0_0%_97%)] [--cell-shadow-color:hsl(0_0%_80%)]",
				"dark:[--cell-border-color:hsl(20_14.3%_15%)] dark:[--cell-fill-color:hsl(20_14.3%_7%)] dark:[--cell-shadow-color:hsl(20_14.3%_12%)]",
			)}
		>
			<div className="relative h-auto w-auto overflow-hidden pointer-events-auto">
				<div className="pointer-events-none absolute inset-0 z-[2] h-full w-full overflow-hidden" />
				<DivGrid
					key={`base-${rippleKey}`}
					className="mask-radial-from-20% mask-radial-at-top"
					rows={rows}
					cols={cols}
					cellSize={cellSize}
					borderColor="var(--cell-border-color)"
					fillColor="var(--cell-fill-color)"
					clickedCell={clickedCell}
					onCellClick={(row, col) => {
						setClickedCell({ row, col });
						setRippleKey((k) => k + 1);
					}}
					interactive
				/>
			</div>
		</div>
	);
};

type DivGridProps = {
	className?: string;
	rows: number;
	cols: number;
	cellSize: number; // in pixels
	borderColor: string;
	fillColor: string;
	clickedCell: { row: number; col: number } | null;
	onCellClick?: (row: number, col: number) => void;
	interactive?: boolean;
};

type CellStyle = React.CSSProperties & {
	["--delay"]?: string;
	["--duration"]?: string;
};

const DivGrid = ({
	className,
	rows = 7,
	cols = 30,
	cellSize = 56,
	borderColor = "#3f3f46",
	fillColor = "rgba(14,165,233,0.3)",
	clickedCell = null,
	onCellClick = () => {},
	interactive = true,
}: DivGridProps) => {
	const cells = useMemo(
		() => Array.from({ length: rows * cols }, (_, idx) => idx),
		[rows, cols],
	);

	const gridStyle: React.CSSProperties = {
		display: "grid",
		gridTemplateColumns: `repeat(${cols}, ${cellSize}px)`,
		gridTemplateRows: `repeat(${rows}, ${cellSize}px)`,
		width: cols * cellSize,
		height: rows * cellSize,
		marginInline: "auto",
	};

	return (
		<div className={cn("relative z-[3]", className)} style={gridStyle}>
			{cells.map((idx) => {
				const rowIdx = Math.floor(idx / cols);
				const colIdx = idx % cols;
				const distance = clickedCell
					? Math.hypot(clickedCell.row - rowIdx, clickedCell.col - colIdx)
					: 0;
				const delay = clickedCell ? Math.max(0, distance * 55) : 0; // ms
				const duration = 200 + distance * 80; // ms

				const style: CellStyle = clickedCell
					? {
							"--delay": `${delay}ms`,
							"--duration": `${duration}ms`,
						}
					: {};

				return (
					<div
						key={idx}
						className={cn(
							"cell relative border-[0.5px] opacity-50 transition-opacity duration-150 will-change-transform hover:opacity-80",
							clickedCell && "animate-cell-ripple [animation-fill-mode:none]",
							!interactive && "pointer-events-none",
						)}
						style={{
							backgroundColor: fillColor,
							borderColor: borderColor,
							...style,
						}}
						onClick={
							interactive ? () => onCellClick?.(rowIdx, colIdx) : undefined
						}
					/>
				);
			})}
		</div>
	);
};
