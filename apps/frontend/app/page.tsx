import Link from "next/link";
import { Sparkles } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { Button } from "@/components/ui/Button";

export default function Home() {
  return (
    <div className="relative flex min-h-full flex-1 flex-col overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden
        style={{
          backgroundImage:
            "radial-gradient(ellipse 80% 55% at 20% -10%, rgba(59,130,246,0.22), transparent), radial-gradient(ellipse 45% 35% at 90% 20%, rgba(232,163,23,0.1), transparent), radial-gradient(ellipse 40% 30% at 10% 90%, rgba(59,130,246,0.1), transparent)",
        }}
      />

      <header
        className="relative z-10 flex w-full items-center justify-between px-4 py-5 sm:px-8 xl:px-10"
        style={{ paddingTop: "max(1.25rem, env(safe-area-inset-top))" }}
      >
        <BrandLogo href="/" size="md" />
        <div className="flex items-center gap-2">
          <Button href="/login" variant="ghost" size="sm">
            Accedi
          </Button>
          <Button href="/register" variant="ember" size="sm">
            Inizia
          </Button>
        </div>
      </header>

      <main className="relative z-10 flex w-full flex-1 flex-col items-start justify-center gap-6 px-4 pb-20 pt-6 sm:px-8 sm:pb-28 xl:px-10">
        <p className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-foreground-muted">
          <Sparkles className="h-3.5 w-3.5 text-accent-text" aria-hidden />
          Collezione TCG
        </p>
        <h1 className="font-display text-5xl font-semibold leading-[1.05] tracking-tight text-foreground sm:text-6xl md:text-7xl">
          Binder
        </h1>
        <p className="max-w-lg text-base leading-relaxed text-foreground-muted sm:text-lg">
          Organizza le tue carte Pokémon, sfoglia le pagine come un vero album e completa ogni
          espansione.
        </p>
        <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center">
          <Button href="/register" variant="ember" size="lg">
            Crea il tuo account
          </Button>
          <Button href="/login" variant="secondary" size="lg">
            Ho già un account
          </Button>
        </div>
        <p className="pt-4 text-xs text-foreground-muted">
          Già dentro?{" "}
          <Link href="/dashboard" className="font-medium text-accent-text hover:underline">
            Vai alla dashboard
          </Link>
        </p>
      </main>
    </div>
  );
}
