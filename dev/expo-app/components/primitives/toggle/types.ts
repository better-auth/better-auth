interface ToggleRootProps {
  pressed: boolean;
  onPressedChange: (pressed: boolean) => void;
  disabled?: boolean;
}

export type { ToggleRootProps };
