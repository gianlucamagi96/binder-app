import { BrandLogo } from "@/components/BrandLogo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col text-foreground-secondary">
      <header
        className="px-4 py-5 sm:px-6"
        style={{ paddingTop: "max(1.25rem, env(safe-area-inset-top))" }}
      >
        <BrandLogo href="/login" />
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
