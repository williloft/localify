/**
 * The shared look of buttons and fields, so the navbar's "Vælg filer", the
 * save buttons and every form control speak the same language (as Lofty's
 * Button does).
 */

type Variant = 'primary' | 'secondary';
type Size = 'sm' | 'md' | 'lg';

const BASE =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-display font-semibold ' +
  'transition-[transform,box-shadow,color,border-color,background-color] duration-150 motion-reduce:transition-none ' +
  'disabled:pointer-events-none disabled:opacity-60';

const SIZES: Record<Size, string> = {
  sm: 'h-10 px-4 text-sm',
  md: 'min-h-11 px-6 text-[0.9375rem]',
  lg: 'min-h-14 px-6 text-lg',
};

const VARIANTS: Record<Variant, string> = {
  // Green capsule with a pressed lip.
  primary:
    'bg-brand text-white shadow-lip hover:-translate-y-px hover:shadow-lip-hover active:translate-y-[2px] active:shadow-lip-pressed',
  // Same capsule, quieter: a hairline that turns green, like Lofty's secondary button.
  secondary:
    'border border-ink/20 bg-surface text-ink hover:border-brand hover:text-brand active:translate-y-px',
};

export function buttonClassName(variant: Variant = 'primary', size: Size = 'md', extra = ''): string {
  return `${BASE} ${SIZES[size]} ${VARIANTS[variant]} ${extra}`.trim();
}

/** Inputs and selects: one height, one border, one focus ring. */
export const FIELD =
  'h-11 w-full min-w-0 rounded-field border border-outline bg-surface px-3.5 text-ink outline-none transition-colors ' +
  'hover:border-ink focus-visible:border-brand focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-brand';
