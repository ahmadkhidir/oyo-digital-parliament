/** The data request queue's route-level loading state (`screens/22-data-request-queue.md`). */
export default function DataRequestsLoading() {
  return (
    <div className="grid gap-xl desktop:grid-cols-5" aria-busy="true">
      <div className="flex flex-col gap-sm desktop:col-span-2">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="h-16 animate-pulse rounded-sm bg-surface-muted" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-sm bg-surface-muted desktop:col-span-3" />
    </div>
  );
}
