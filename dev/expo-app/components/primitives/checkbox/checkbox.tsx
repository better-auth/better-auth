import * as React from "react";
import {type GestureResponderEvent, Pressable, View} from "react-native";
import * as Slot from "@/components/primitives/slot";
import type {
  ComponentPropsWithAsChild,
  PressableRef,
  SlottablePressableProps,
} from "@/components/primitives/types";
import type {CheckboxIndicator, CheckboxRootProps} from "./types";

interface RootContext extends CheckboxRootProps {
  nativeID?: string;
}

const CheckboxContext = React.createContext<RootContext | null>(null);

const Root = React.forwardRef<
  PressableRef,
  SlottablePressableProps & CheckboxRootProps
>(
  (
    {asChild, disabled = false, checked, onCheckedChange, nativeID, ...props},
    ref,
  ) => {
    return (
      <CheckboxContext.Provider
        value={{
          disabled,
          checked,
          onCheckedChange,
          nativeID,
        }}
      >
        <Trigger ref={ref} {...props} />
      </CheckboxContext.Provider>
    );
  },
);

Root.displayName = "RootNativeCheckbox";

function useCheckboxContext() {
  const context = React.useContext(CheckboxContext);
  if (!context) {
    throw new Error(
      "Checkbox compound components cannot be rendered outside the Checkbox component",
    );
  }
  return context;
}

const Trigger = React.forwardRef<PressableRef, SlottablePressableProps>(
  ({asChild, onPress: onPressProp, ...props}, ref) => {
    const {disabled, checked, onCheckedChange, nativeID} =
      useCheckboxContext();

    function onPress(ev: GestureResponderEvent) {
      if (disabled) return;
      const newValue = !checked;
      onCheckedChange(newValue);
      onPressProp?.(ev);
    }

    const Component = asChild ? Slot.Pressable : Pressable;
    return (
      <Component
        ref={ref}
        nativeID={nativeID}
        aria-disabled={disabled}
        role="checkbox"
        aria-checked={checked}
        onPress={onPress}
        accessibilityState={{
          checked,
          disabled,
        }}
        disabled={disabled}
        {...props}
      />
    );
  },
);

Trigger.displayName = "TriggerNativeCheckbox";

const Indicator = React.forwardRef<
  React.ElementRef<typeof View>,
  ComponentPropsWithAsChild<typeof View> & CheckboxIndicator
>(({asChild, forceMount, ...props}, ref) => {
  const {checked, disabled} = useCheckboxContext();

  if (!forceMount) {
    if (!checked) {
      return null;
    }
  }

  const Component = asChild ? Slot.View : View;
  return (
    <Component
      ref={ref}
      aria-disabled={disabled}
      aria-hidden={!(forceMount || checked)}
      role={"presentation"}
      {...props}
    />
  );
});

Indicator.displayName = "IndicatorNativeCheckbox";

export {Indicator, Root};
