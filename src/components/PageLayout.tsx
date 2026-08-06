import { Navigation } from "./Navigation";

interface PageLayoutProps {
  children: React.ReactNode;
  fullWidth?: boolean;
  className?: string;
  noPadding?: boolean;
}

/**
 * PageLayout wraps authenticated pages with the sidebar navigation.
 * Provides correct spacing for desktop sidebar and mobile top bar.
 */
export const PageLayout = ({
  children,
  fullWidth = false,
  className = "",
  noPadding = false,
}: PageLayoutProps) => {
  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <main className="md:pl-[224px] pt-14 md:pt-0">
        <div
          className={[
            !fullWidth && "max-w-7xl mx-auto",
            !noPadding && "px-4 md:px-6 py-6 md:py-8",
            className,
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {children}
        </div>
      </main>
    </div>
  );
};
