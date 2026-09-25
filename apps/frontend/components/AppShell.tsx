"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BookOpen, Heart, Home, Layers, LogOut, Search, Sparkles } from "lucide-react";
import { useAuth } from "@/context/auth-context";
import { API_URL, type TcgGame } from "@/lib/auth";
import { BrandLogo } from "@/components/BrandLogo";
import { CommandSearch } from "@/components/CommandSearch";
import { AppChat } from "@/components/AppChat";
import { TcgGameIcon } from "@/components/TcgGameIcon";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/binders", label: "Binder", icon: BookOpen },
  { href: "/catalogo", label: "Catalogo", icon: Layers },
  { href: "/wishlist", label: "Wishlist", icon: Heart },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [activeGame, setActiveGame] = useState<TcgGame | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user?.activeTcgGameCode) {
      return;
    }
    let cancelled = false;
    fetch(`${API_URL}/tcg-games`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((games: TcgGame[]) => {
        if (!cancelled) {
          setActiveGame(games.find((g) => g.code === user.activeTcgGameCode) ?? null);
        }
      })
      .catch(() => {
        if (!cancelled) setActiveGame(null);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.activeTcgGameCode]);

  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen((open) => !open);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  async function handleLogout() {
    setMenuOpen(false);
    await logout();
    router.push("/login");
  }

  function isActive(href: string) {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <div className="flex min-h-full flex-1 flex-col text-foreground-secondary">
      <header
        className="sticky top-0 z-30 border-b border-border/80 bg-surface/85 backdrop-blur-xl supports-[backdrop-filter]:bg-surface/70"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="flex h-14 w-full items-center justify-between gap-3 px-4 sm:h-16 sm:px-6 lg:px-8 xl:px-10">
          <div className="flex items-center gap-6">
            <BrandLogo />
            <nav className="hidden items-center gap-1 md:flex" aria-label="Principale">
              {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
                const active = isActive(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    className={`inline-flex h-10 items-center gap-2 rounded-[var(--radius-md)] px-3 text-sm font-medium transition-colors duration-150 ${
                      active
                        ? "bg-accent-soft text-accent-text"
                        : "text-foreground-muted hover:bg-surface-hover hover:text-foreground"
                    }`}
                  >
                    <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                    {label}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              aria-label="Cerca nel catalogo (Ctrl+K)"
              className="inline-flex h-10 items-center gap-2 rounded-[var(--radius-md)] border border-border bg-surface px-2.5 text-sm text-foreground-muted shadow-xs transition-colors duration-150 hover:border-border-strong hover:bg-surface-hover hover:text-foreground sm:min-w-[9.5rem] sm:px-3"
            >
              <Search className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
              <span className="hidden flex-1 text-left sm:inline">Cerca…</span>
              <kbd className="ml-auto hidden rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[10px] text-foreground-muted md:inline">
                ⌘K
              </kbd>
            </button>

            <Link
              href="/tcg-picker"
              className="flex h-10 max-w-[10rem] items-center gap-2 rounded-[var(--radius-md)] border border-border bg-surface px-2.5 text-sm text-foreground-secondary shadow-xs transition-colors duration-150 hover:border-border-strong hover:bg-surface-hover sm:max-w-none sm:px-3"
            >
            {activeGame && user?.activeTcgGameCode ? (
              <>
                <TcgGameIcon
                  icon={activeGame.icon}
                  name={activeGame.name}
                  className="h-6 w-[17px]"
                />
                <span className="truncate">{activeGame.name}</span>
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 shrink-0 text-foreground-muted" aria-hidden />
                <span className="truncate text-foreground-muted">Scegli gioco</span>
              </>
            )}
            </Link>

            <div ref={menuRef} className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((open) => !open)}
                aria-expanded={menuOpen}
                aria-label="Menu utente"
                className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-accent-soft text-sm font-semibold text-accent-text shadow-xs transition-transform duration-150 hover:border-accent/30 active:scale-95"
              >
                {user?.username?.[0]?.toUpperCase() ?? "?"}
              </button>

              {menuOpen && (
                <div className="absolute right-0 top-12 z-40 flex w-56 flex-col overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-lg">
                  <div className="border-b border-border px-4 py-3">
                    <p className="truncate text-sm font-semibold text-foreground">{user?.username}</p>
                    <p className="truncate text-xs text-foreground-muted">{user?.email}</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="flex items-center gap-2 px-4 py-3 text-left text-sm text-danger-foreground transition-colors duration-150 hover:bg-danger-soft"
                  >
                    <LogOut className="h-4 w-4" aria-hidden />
                    Esci
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="flex flex-1 flex-col pb-[calc(4.25rem+env(safe-area-inset-bottom))] md:pb-0">
        {children}
      </main>

      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border/80 bg-surface/95 backdrop-blur-xl md:hidden supports-[backdrop-filter]:bg-surface/80"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        aria-label="Navigazione mobile"
      >
        <div className="flex h-[4.25rem] w-full items-stretch justify-around px-1">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors duration-150 ${
                  active ? "text-accent-text" : "text-foreground-muted"
                }`}
              >
                <span
                  className={`flex h-9 w-12 items-center justify-center rounded-full transition-colors duration-150 ${
                    active ? "bg-accent-soft" : ""
                  }`}
                >
                  <Icon className="h-5 w-5" strokeWidth={active ? 2.25 : 1.75} aria-hidden />
                </span>
                {label}
              </Link>
            );
          })}
        </div>
      </nav>

      <CommandSearch open={searchOpen} onOpenChange={setSearchOpen} />
      <AppChat />
    </div>
  );
}
