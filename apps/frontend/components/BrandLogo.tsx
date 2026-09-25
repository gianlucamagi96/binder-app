import Link from "next/link";

export function BrandLogo({
  href = "/dashboard",
  size = "md",
}: {
  href?: string;
  size?: "sm" | "md" | "lg";
}) {
  const text =
    size === "lg"
      ? "text-2xl sm:text-3xl"
      : size === "sm"
        ? "text-base"
        : "text-lg";

  return (
    <Link
      href={href}
      className={`font-display font-semibold tracking-tight text-foreground ${text}`}
    >
      Binder
    </Link>
  );
}
