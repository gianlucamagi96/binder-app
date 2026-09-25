type Props = {
  icon: string | null | undefined;
  name?: string;
  /** Dimensione CSS (Tailwind), es. h-5 w-5 / h-12 w-8 */
  className?: string;
  /** Per emoji grandi nel picker */
  emojiClassName?: string;
};

function isImageIcon(icon: string) {
  return (
    icon.startsWith("http://") ||
    icon.startsWith("https://") ||
    icon.startsWith("/") ||
    icon.startsWith("data:")
  );
}

/** Renderizza l'icona di un TCG: URL immagine oppure emoji/testo. */
export function TcgGameIcon({
  icon,
  name = "TCG",
  className = "h-5 w-4",
  emojiClassName = "text-base leading-none",
}: Props) {
  if (!icon) return null;

  if (isImageIcon(icon)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={icon}
        alt=""
        title={name}
        aria-hidden
        className={`shrink-0 object-contain ${className}`}
      />
    );
  }

  return (
    <span className={`shrink-0 ${emojiClassName}`} aria-hidden>
      {icon}
    </span>
  );
}
