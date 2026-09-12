export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center" role="status" aria-live="polite">
      <span className="size-8 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600" />
      <span className="sr-only">{label}</span>
    </div>
  );
}
