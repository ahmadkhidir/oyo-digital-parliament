/**
 * The console's route-level loading state (`screens/26-admin-home.md` Loading).
 *
 * It renders while the role and its destinations are read. It names no destination, because none is
 * guessed before the role is known.
 */
export default function AdminLoading() {
  return (
    <div className="flex flex-col gap-xl" aria-busy="true">
      <div className="h-8 w-48 animate-pulse rounded-sm bg-surface-muted" />
      <div className="grid gap-md tablet:grid-cols-2 desktop:grid-cols-3">
        {[0, 1, 2].map((index) => (
          <div key={index} className="h-24 animate-pulse rounded-sm bg-surface-muted" />
        ))}
      </div>
    </div>
  );
}
