import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

/**
 * One style for every note in the editor: what is kept, what is re-encoded,
 * what would be lost. Calm by default; red only when data goes missing.
 */
export function Notice({
  tone = 'neutral',
  icon,
  children,
}: {
  tone?: 'neutral' | 'danger';
  icon: IconName;
  children: ReactNode;
}) {
  const danger = tone === 'danger';
  return (
    <div
      className={`flex items-start gap-3 rounded-field border px-4 py-3 text-sm ${
        danger ? 'border-danger/25 bg-danger-tint text-ink' : 'border-line bg-surface text-ink-dim'
      }`}
    >
      <Icon
        name={icon}
        className={`w-4 h-4 shrink-0 mt-0.5 ${danger ? 'text-danger' : icon === 'shield' ? 'text-brand' : 'text-ink-dim'}`}
      />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
