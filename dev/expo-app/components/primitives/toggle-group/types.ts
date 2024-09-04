type SingleRootProps = {
  type: "single";
  value: string | undefined;
  onValueChange: (val: string | undefined) => void;
};

type MultipleRootProps = {
  type: "multiple";
  value: string[];
  onValueChange: (val: string[]) => void;
};

type ToggleGroupRootProps = (SingleRootProps | MultipleRootProps) & {
  disabled?: boolean;
  /**
   * Platform: WEB ONLY
   */
  rovingFocus?: boolean;
  /**
   * Platform: WEB ONLY
   */
  orientation?: "horizontal" | "vertical";
  /**
   * Platform: WEB ONLY
   */
  dir?: "ltr" | "rtl";
  /**
   * Platform: WEB ONLY
   */
  loop?: boolean;
};

interface ToggleGroupItemProps {
  value: string;
}

export type { ToggleGroupRootProps, ToggleGroupItemProps };
