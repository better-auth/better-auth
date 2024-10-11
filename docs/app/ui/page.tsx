import { GridPattern } from "@/components/landing/grid-pattern";
import { HeroBackground } from "@/components/landing/hero";
import AuthUIHero from "./_components/hero";
import { ComponentDisplay } from "./_components/component-display";
import Section from "@/components/landing/section";

const BetterAuthUI = () => {
  return (
    <div className="flex flex-col gap-2">
      <Section
        className="-z-1 mb-1  overflow-y-clip"
        crosses
        crossesOffset="lg:translate-y-[15.25rem]"
        customPaddings
        id="hero"
      >
        <div className="container">
          <AuthUIHero />
          <ComponentDisplay />
        </div>
      </Section>
    </div>
  );
};

export default BetterAuthUI;
