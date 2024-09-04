interface ProgressRootProps {
  value?: number | null | undefined;
  max?: number;
  getValueLabel?(value: number, max: number): string;
}

export type { ProgressRootProps };
