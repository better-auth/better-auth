import type {
  ForceMountable,
  PressableRef,
} from "@/components/primitives/types";

type Option =
  | {
      value: string;
      label: string;
    }
  | undefined;

interface RootContext {
  value: Option;
  onValueChange: (option: Option) => void;
  disabled?: boolean;
}

interface SelectRootProps {
  value?: Option;
  defaultValue?: Option;
  onValueChange?: (option: Option) => void;
  onOpenChange?: (open: boolean) => void;
  disabled?: boolean;
  /**
   * Platform: WEB ONLY
   */
  dir?: "ltr" | "rtl";
  /**
   * Platform: WEB ONLY
   */
  name?: string;
  /**
   * Platform: WEB ONLY
   */
  required?: boolean;
}

interface SelectValueProps {
  placeholder: string;
}

interface SelectPortalProps extends ForceMountable {
  children: React.ReactNode;
  /**
   * Platform: NATIVE ONLY
   */
  hostName?: string;
  /**
   * Platform: WEB ONLY
   */
  container?: HTMLElement | null | undefined;
}

interface SelectOverlayProps extends ForceMountable {
  closeOnPress?: boolean;
}

interface SelectContentProps {
  /**
   * Platform: WEB ONLY
   */
  position?: "popper" | "item-aligned" | undefined;
}

interface SelectItemProps {
  value: string;
  label: string;
  closeOnPress?: boolean;
}

interface SelectSeparatorProps {
  decorative?: boolean;
}

interface SelectTriggerRef extends PressableRef {
  open: () => void;
  close: () => void;
}

export type {
  Option,
  RootContext,
  SelectContentProps,
  SelectItemProps,
  SelectOverlayProps,
  SelectPortalProps,
  SelectRootProps,
  SelectSeparatorProps,
  SelectTriggerRef,
  SelectValueProps,
};
