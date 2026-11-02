/**
 * A thin progress bar. With `value` and `max` it is determinate; without them it
 * is indeterminate: a phase is running but nothing measures it, so no percent
 * is shown. It is a semantic progressbar with a name, but carries no live
 * announcements of its own; the page announces steps in a status line.
 */
export function ProgressBar({
  value,
  max,
  label,
  className = '',
}: {
  value?: number;
  max?: number;
  label?: string;
  className?: string;
}) {
  const determinate = value !== undefined && max !== undefined && max > 0;
  return (
    <div
      role={label ? 'progressbar' : undefined}
      aria-label={label}
      aria-valuemin={label && determinate ? 0 : undefined}
      aria-valuemax={label && determinate ? max : undefined}
      aria-valuenow={label && determinate ? value : undefined}
      className={`h-1.5 w-full overflow-hidden rounded-full bg-sunken ${className}`}
    >
      <div
        className={`h-full rounded-full bg-brand ${
          determinate ? 'transition-[width] duration-150 motion-reduce:transition-none' : 'w-full motion-safe:animate-pulse'
        }`}
        style={determinate ? { width: `${Math.min(100, (value / max) * 100)}%` } : undefined}
      />
    </div>
  );
}
