/** A type name: a link to its section when it has one, plain text for scalars. */
export function TypeLink({
  href,
  label,
}: {
  readonly href: string | null
  readonly label: string
}) {
  if (href === null) return <span className="font-mono text-[12.5px]">{label}</span>
  return (
    <a
      className="font-mono text-[12.5px] font-semibold text-accent-text hover:underline"
      href={href}
    >
      {label}
    </a>
  )
}
