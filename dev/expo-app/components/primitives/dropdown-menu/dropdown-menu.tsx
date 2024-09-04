import * as React from "react";
import {
  BackHandler,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type LayoutRectangle,
  Pressable,
  Text,
  View,
} from "react-native";
import {
  type LayoutPosition,
  useRelativePosition,
} from "@/components/primitives/hooks";
import {Portal as RNPPortal} from "@/components/primitives/portal";
import * as Slot from "@/components/primitives/slot";
import type {
  ForceMountable,
  PositionedContentProps,
  PressableRef,
  SlottablePressableProps,
  SlottableTextProps,
  SlottableViewProps,
  TextRef,
  ViewRef,
} from "@/components/primitives/types";
import type {
  DropdownMenuCheckboxItemProps,
  DropdownMenuItemProps,
  DropdownMenuOverlayProps,
  DropdownMenuPortalProps,
  DropdownMenuRadioGroupProps,
  DropdownMenuRadioItemProps,
  DropdownMenuRootProps,
  DropdownMenuSeparatorProps,
  DropdownMenuSubProps,
  DropdownMenuSubTriggerProps,
} from "./types";

interface IRootContext extends DropdownMenuRootProps {
  triggerPosition: LayoutPosition | null;
  setTriggerPosition: (triggerPosition: LayoutPosition | null) => void;
  contentLayout: LayoutRectangle | null;
  setContentLayout: (contentLayout: LayoutRectangle | null) => void;
  nativeID: string;
}

const RootContext = React.createContext<IRootContext | null>(null);

const Root = React.forwardRef<
  ViewRef,
  SlottableViewProps & DropdownMenuRootProps
>(({asChild, open, onOpenChange, ...viewProps}, ref) => {
  const nativeID = React.useId();
  const [triggerPosition, setTriggerPosition] =
    React.useState<LayoutPosition | null>(null);
  const [contentLayout, setContentLayout] =
    React.useState<LayoutRectangle | null>(null);

  const Component = asChild ? Slot.View : View;
  return (
    <RootContext.Provider
      value={{
        open,
        onOpenChange,
        contentLayout,
        setContentLayout,
        nativeID,
        setTriggerPosition,
        triggerPosition,
      }}
    >
      <Component ref={ref} {...viewProps} />
    </RootContext.Provider>
  );
});

Root.displayName = "RootNativeDropdownMenu";

function useRootContext() {
  const context = React.useContext(RootContext);
  if (!context) {
    throw new Error(
      "DropdownMenu compound components cannot be rendered outside the DropdownMenu component",
    );
  }
  return context;
}

const Trigger = React.forwardRef<PressableRef, SlottablePressableProps>(
  ({asChild, onPress: onPressProp, disabled = false, ...props}, ref) => {
    const triggerRef = React.useRef<View>(null);
    const {open, onOpenChange, setTriggerPosition} = useRootContext();

    React.useImperativeHandle(
      ref,
      () => {
        if (!triggerRef.current) {
          return new View({});
        }
        return triggerRef.current;
      },
      [triggerRef.current],
    );

    function onPress(ev: GestureResponderEvent) {
      if (disabled) return;
      triggerRef.current?.measure((_x, _y, width, height, pageX, pageY) => {
        setTriggerPosition({width, pageX, pageY: pageY, height});
      });
      const newValue = !open;
      onOpenChange(newValue);
      onPressProp?.(ev);
    }

    const Component = asChild ? Slot.Pressable : Pressable;
    return (
      <Component
        ref={triggerRef}
        aria-disabled={disabled ?? undefined}
        role="button"
        onPress={onPress}
        disabled={disabled ?? undefined}
        aria-expanded={open}
        {...props}
      />
    );
  },
);

Trigger.displayName = "TriggerNativeDropdownMenu";

/**
 * @warning when using a custom `<PortalHost />`, you might have to adjust the Content's sideOffset to account for nav elements like headers.
 */
function Portal({forceMount, hostName, children}: DropdownMenuPortalProps) {
  const value = useRootContext();

  if (!value.triggerPosition) {
    return null;
  }

  if (!forceMount) {
    if (!value.open) {
      return null;
    }
  }

  return (
    <RNPPortal hostName={hostName} name={`${ value.nativeID }_portal`}>
      <RootContext.Provider value={value}>{children}</RootContext.Provider>
    </RNPPortal>
  );
}

const Overlay = React.forwardRef<
  PressableRef,
  SlottablePressableProps & DropdownMenuOverlayProps
>(
  (
    {
      asChild,
      forceMount,
      onPress: OnPressProp,
      closeOnPress = true,
      ...props
    },
    ref,
  ) => {
    const {open, onOpenChange, setContentLayout, setTriggerPosition} =
      useRootContext();

    function onPress(ev: GestureResponderEvent) {
      if (closeOnPress) {
        setTriggerPosition(null);
        setContentLayout(null);
        onOpenChange(false);
      }
      OnPressProp?.(ev);
    }

    if (!forceMount) {
      if (!open) {
        return null;
      }
    }

    const Component = asChild ? Slot.Pressable : Pressable;
    return <Component ref={ref} onPress={onPress} {...props} />;
  },
);

Overlay.displayName = "OverlayNativeDropdownMenu";

/**
 * @info `position`, `top`, `left`, and `maxWidth` style properties are controlled internally. Opt out of this behavior by setting `disablePositioningStyle` to `true`.
 */
const Content = React.forwardRef<
  PressableRef,
  SlottablePressableProps & PositionedContentProps
>(
  (
    {
      asChild = false,
      forceMount,
      align = "start",
      side = "bottom",
      sideOffset = 0,
      alignOffset = 0,
      avoidCollisions = true,
      onLayout: onLayoutProp,
      insets,
      style,
      disablePositioningStyle,
      ...props
    },
    ref,
  ) => {
    const {
      open,
      onOpenChange,
      nativeID,
      triggerPosition,
      setTriggerPosition,
      contentLayout,
      setContentLayout,
    } = useRootContext();

    React.useEffect(() => {
      const backHandler = BackHandler.addEventListener(
        "hardwareBackPress",
        () => {
          setTriggerPosition(null);
          setContentLayout(null);
          onOpenChange(false);
          return true;
        },
      );

      return () => {
        setContentLayout(null);
        backHandler.remove();
      };
    }, []);

    const positionStyle = useRelativePosition({
      align,
      avoidCollisions,
      triggerPosition,
      contentLayout,
      alignOffset,
      insets,
      sideOffset,
      side,
      disablePositioningStyle,
    });

    function onLayout(event: LayoutChangeEvent) {
      setContentLayout(event.nativeEvent.layout);
      onLayoutProp?.(event);
    }

    if (!forceMount) {
      if (!open) {
        return null;
      }
    }

    const Component = asChild ? Slot.Pressable : Pressable;
    return (
      <Component
        ref={ref}
        role="menu"
        nativeID={nativeID}
        aria-modal={true}
        style={[positionStyle, style]}
        onLayout={onLayout}
        {...props}
      />
    );
  },
);

Content.displayName = "ContentNativeDropdownMenu";

const Item = React.forwardRef<
  PressableRef,
  SlottablePressableProps & DropdownMenuItemProps
>(
  (
    {
      asChild,
      textValue,
      onPress: onPressProp,
      disabled = false,
      closeOnPress = true,
      ...props
    },
    ref,
  ) => {
    const {onOpenChange, setTriggerPosition, setContentLayout} =
      useRootContext();

    function onPress(ev: GestureResponderEvent) {
      if (closeOnPress) {
        setTriggerPosition(null);
        setContentLayout(null);
        onOpenChange(false);
      }
      onPressProp?.(ev);
    }

    const Component = asChild ? Slot.Pressable : Pressable;
    return (
      <Component
        ref={ref}
        role="menuitem"
        onPress={onPress}
        disabled={disabled}
        aria-valuetext={textValue}
        aria-disabled={!!disabled}
        accessibilityState={{disabled: !!disabled}}
        {...props}
      />
    );
  },
);

Item.displayName = "ItemNativeDropdownMenu";

const Group = React.forwardRef<ViewRef, SlottableViewProps>(
  ({asChild, ...props}, ref) => {
    const Component = asChild ? Slot.View : View;
    return <Component ref={ref} role="group" {...props} />;
  },
);

Group.displayName = "GroupNativeDropdownMenu";

const Label = React.forwardRef<TextRef, SlottableTextProps>(
  ({asChild, ...props}, ref) => {
    const Component = asChild ? Slot.Text : Text;
    return <Component ref={ref} {...props} />;
  },
);

Label.displayName = "LabelNativeDropdownMenu";

type FormItemContext =
  | {checked: boolean}
  | {
    value: string | undefined;
    onValueChange: (value: string) => void;
  };

const FormItemContext = React.createContext<FormItemContext | null>(null);

const CheckboxItem = React.forwardRef<
  PressableRef,
  SlottablePressableProps & DropdownMenuCheckboxItemProps
>(
  (
    {
      asChild,
      checked,
      onCheckedChange,
      textValue,
      onPress: onPressProp,
      closeOnPress = true,
      disabled = false,
      ...props
    },
    ref,
  ) => {
    const {onOpenChange, setContentLayout, setTriggerPosition, nativeID} =
      useRootContext();

    function onPress(ev: GestureResponderEvent) {
      onCheckedChange(!checked);
      if (closeOnPress) {
        setTriggerPosition(null);
        setContentLayout(null);
        onOpenChange(false);
      }
      onPressProp?.(ev);
    }

    const Component = asChild ? Slot.Pressable : Pressable;
    return (
      <FormItemContext.Provider value={{checked}}>
        <Component
          ref={ref}
          key={`checkbox-${ nativeID }-${ checked }`}
          role="checkbox"
          aria-checked={checked}
          onPress={onPress}
          disabled={disabled}
          aria-disabled={!!disabled}
          aria-valuetext={textValue}
          accessibilityState={{disabled: !!disabled}}
          {...props}
        />
      </FormItemContext.Provider>
    );
  },
);

CheckboxItem.displayName = "CheckboxItemNativeDropdownMenu";

function useFormItemContext() {
  const context = React.useContext(FormItemContext);
  if (!context) {
    throw new Error(
      "CheckboxItem or RadioItem compound components cannot be rendered outside of a CheckboxItem or RadioItem component",
    );
  }
  return context;
}

const RadioGroup = React.forwardRef<
  ViewRef,
  SlottableViewProps & DropdownMenuRadioGroupProps
>(({asChild, value, onValueChange, ...props}, ref) => {
  const Component = asChild ? Slot.View : View;
  return (
    <FormItemContext.Provider value={{value, onValueChange}}>
      <Component ref={ref} role="radiogroup" {...props} />
    </FormItemContext.Provider>
  );
});

RadioGroup.displayName = "RadioGroupNativeDropdownMenu";

type BothFormItemContext = Exclude<FormItemContext, {checked: boolean}> & {
  checked: boolean;
};

const RadioItemContext = React.createContext({} as {itemValue: string});

const RadioItem = React.forwardRef<
  PressableRef,
  SlottablePressableProps & DropdownMenuRadioItemProps
>(
  (
    {
      asChild,
      value: itemValue,
      textValue,
      onPress: onPressProp,
      disabled = false,
      closeOnPress = true,
      ...props
    },
    ref,
  ) => {
    const {onOpenChange, setContentLayout, setTriggerPosition} =
      useRootContext();

    const {value, onValueChange} =
      useFormItemContext() as BothFormItemContext;
    function onPress(ev: GestureResponderEvent) {
      onValueChange(itemValue);
      if (closeOnPress) {
        setTriggerPosition(null);
        setContentLayout(null);
        onOpenChange(false);
      }
      onPressProp?.(ev);
    }

    const Component = asChild ? Slot.Pressable : Pressable;
    return (
      <RadioItemContext.Provider value={{itemValue}}>
        <Component
          ref={ref}
          onPress={onPress}
          role="radio"
          aria-checked={value === itemValue}
          disabled={disabled ?? false}
          accessibilityState={{
            disabled: disabled ?? false,
            checked: value === itemValue,
          }}
          aria-valuetext={textValue}
          {...props}
        />
      </RadioItemContext.Provider>
    );
  },
);

RadioItem.displayName = "RadioItemNativeDropdownMenu";

function useItemIndicatorContext() {
  return React.useContext(RadioItemContext);
}

const ItemIndicator = React.forwardRef<
  ViewRef,
  SlottableViewProps & ForceMountable
>(({asChild, forceMount, ...props}, ref) => {
  const {itemValue} = useItemIndicatorContext();
  const {checked, value} = useFormItemContext() as BothFormItemContext;

  if (!forceMount) {
    if (itemValue == null && !checked) {
      return null;
    }
    if (value !== itemValue) {
      return null;
    }
  }
  const Component = asChild ? Slot.View : View;
  return <Component ref={ref} role="presentation" {...props} />;
});

ItemIndicator.displayName = "ItemIndicatorNativeDropdownMenu";

const Separator = React.forwardRef<
  ViewRef,
  SlottableViewProps & DropdownMenuSeparatorProps
>(({asChild, decorative, ...props}, ref) => {
  const Component = asChild ? Slot.View : View;
  return (
    <Component
      role={decorative ? "presentation" : "separator"}
      ref={ref}
      {...props}
    />
  );
});

Separator.displayName = "SeparatorNativeDropdownMenu";

const SubContext = React.createContext<{
  nativeID: string;
  open: boolean;
  onOpenChange: (value: boolean) => void;
} | null>(null);

const Sub = React.forwardRef<
  ViewRef,
  SlottableViewProps & DropdownMenuSubProps
>(({asChild, open, onOpenChange, ...props}, ref) => {
  const nativeID = React.useId();

  const Component = asChild ? Slot.View : View;
  return (
    <SubContext.Provider
      value={{
        nativeID,
        open,
        onOpenChange,
      }}
    >
      <Component ref={ref} {...props} />
    </SubContext.Provider>
  );
});

Sub.displayName = "SubNativeDropdownMenu";

function useSubContext() {
  const context = React.useContext(SubContext);
  if (!context) {
    throw new Error(
      "Sub compound components cannot be rendered outside of a Sub component",
    );
  }
  return context;
}

const SubTrigger = React.forwardRef<
  PressableRef,
  SlottablePressableProps & DropdownMenuSubTriggerProps
>(
  (
    {asChild, textValue, onPress: onPressProp, disabled = false, ...props},
    ref,
  ) => {
    const {nativeID, open, onOpenChange} = useSubContext();

    function onPress(ev: GestureResponderEvent) {
      onOpenChange(!open);
      onPressProp?.(ev);
    }

    const Component = asChild ? Slot.Pressable : Pressable;
    return (
      <Component
        ref={ref}
        aria-valuetext={textValue}
        role="menuitem"
        aria-expanded={open}
        accessibilityState={{expanded: open, disabled: !!disabled}}
        nativeID={nativeID}
        onPress={onPress}
        disabled={disabled}
        aria-disabled={!!disabled}
        {...props}
      />
    );
  },
);

SubTrigger.displayName = "SubTriggerNativeDropdownMenu";

const SubContent = React.forwardRef<
  PressableRef,
  SlottablePressableProps & ForceMountable
>(({asChild = false, forceMount, ...props}, ref) => {
  const {open, nativeID} = useSubContext();

  if (!forceMount) {
    if (!open) {
      return null;
    }
  }

  const Component = asChild ? Slot.Pressable : Pressable;
  return (
    <Component ref={ref} role="group" aria-labelledby={nativeID} {...props} />
  );
});

Content.displayName = "ContentNativeDropdownMenu";

export {
  CheckboxItem,
  Content,
  Group,
  Item,
  ItemIndicator,
  Label,
  Overlay,
  Portal,
  RadioGroup,
  RadioItem,
  Root,
  Separator,
  Sub,
  SubContent,
  SubTrigger,
  Trigger,
  useRootContext,
  useSubContext,
};
