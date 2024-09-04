import * as React from "react";
import {Platform} from "react-native";
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
  withSpring,
} from "react-native-reanimated";
import {cn} from "@/lib/utils";
import * as ProgressPrimitive from "../primitives/progress";

const Progress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root> & {
    indicatorClassName?: string;
  }
>(({className, value, indicatorClassName, ...props}, ref) => {
  return (
    <ProgressPrimitive.Root
      ref={ref}
      className={cn(
        "relative h-4 w-full overflow-hidden rounded-full bg-secondary",
        className,
      )}
      {...props}
    >
      <Indicator value={value} className={indicatorClassName} />
    </ProgressPrimitive.Root>
  );
});
Progress.displayName = ProgressPrimitive.Root.displayName;

export {Progress};

function Indicator({
  value,
  className,
}: {value: number | undefined | null; className?: string}) {
  const progress = useDerivedValue(() => value ?? 0);

  const indicator = useAnimatedStyle(() => {
    return {
      width: withSpring(
        `${ interpolate(
          progress.value,
          [0, 100],
          [1, 100],
          Extrapolation.CLAMP,
        ) }%`,
        {overshootClamping: true},
      ),
    };
  });

  if (Platform.OS === "web") {
    return (
      <ProgressPrimitive.Indicator
        className={cn(
          "h-full w-full flex-1 bg-primary web:transition-all",
          className,
        )}
        style={{transform: `translateX(-${ 100 - (value ?? 0) }%)`}}
      />
    );
  }

  return (
    <ProgressPrimitive.Indicator asChild>
      <Animated.View
        style={indicator}
        className={cn("h-full bg-foreground", className)}
      />
    </ProgressPrimitive.Indicator>
  );
}
