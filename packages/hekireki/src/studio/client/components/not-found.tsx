export function NotFound({ what, name }: { readonly what: string; readonly name: string }) {
  return (
    <section className="p-6">
      <h1 className="page-title">Not found</h1>
      <p className="mt-3 text-muted">
        No {what} named <code>{name}</code> exists in the current schema.
      </p>
    </section>
  )
}
