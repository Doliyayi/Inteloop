// Shared wordmark used across the marketing site and the app shell.
export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2 text-lg font-semibold tracking-tight ${className}`}>
      <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-rose-500 to-orange-400 text-sm font-bold text-white">
        i
      </span>
      Inteloop
    </span>
  );
}
