export function Footer() {
  return (
    <footer className="border-t border-rule bg-paper">
      <div className="mx-auto max-w-[1000px] px-6 py-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-serif italic text-ink-muted text-sm">
            A practice, not a product.
          </p>
          <p className="font-mono text-xs text-ink-faint">
            © 2026 Tony Llongueras
          </p>
        </div>
      </div>
    </footer>
  );
}
