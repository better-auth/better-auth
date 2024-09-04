interface RadioGroupRootProps {
  value: string | undefined;
  onValueChange: (val: string) => void;
  disabled?: boolean;
}

interface RadioGroupItemProps {
  value: string;
  /**
   * nativeID of the label element that describes this radio group item
   */
  "aria-labelledby": string;
}

export type { RadioGroupRootProps, RadioGroupItemProps };
