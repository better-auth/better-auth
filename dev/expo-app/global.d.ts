import type { SvgProps as DefaultSvgProps } from "react-native-svg";

declare module "react-native-svg" {
  interface SvgProps extends DefaultSvgProps {
    className?: string;
  }
}
