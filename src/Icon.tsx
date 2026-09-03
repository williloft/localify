/**
 * Inline icon set.
 *
 * These replace the Material Symbols webfont. Loading icons from a font meant
 * every glyph depended on a Google CDN request, and when that request failed —
 * ad blockers, restrictive networks, offline — every icon rendered as its raw
 * name ("music_note", "close") in the middle of the layout. Inline SVG has no
 * such failure mode, and drops two external requests from the page.
 *
 * Simple originals on a 24x24 grid, stroked in currentColor so they inherit
 * text colour and size from their container.
 */

export type IconName =
  | 'add'
  | 'audio_file'
  | 'check_circle'
  | 'close'
  | 'download'
  | 'edit'
  | 'image'
  | 'music_note'
  | 'shield'
  | 'warning';

interface Props {
  name: IconName;
  className?: string;
  /** Decorative by default; pass a label when the icon is the only content. */
  label?: string;
}

const PATHS: Record<IconName, React.ReactNode> = {
  add: <path d="M12 5v14M5 12h14" />,

  close: <path d="M6 6l12 12M18 6L6 18" />,

  check_circle: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l2.5 2.5L16 9.5" />
    </>
  ),

  download: <path d="M12 3v11M8 10.5l4 4 4-4M4 19h16" />,

  edit: (
    <>
      <path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3z" />
      <path d="M14.5 6.5l3 3" />
    </>
  ),

  image: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8.5" cy="9.5" r="1.5" />
      <path d="M21 16l-5-5-6 6-2-2-5 5" />
    </>
  ),

  music_note: (
    <>
      <circle cx="7" cy="17.5" r="3" />
      <circle cx="17" cy="15.5" r="3" />
      <path d="M10 17.5V6l10-2v11.5" />
      <path d="M10 9l10-2" />
    </>
  ),

  audio_file: (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <circle cx="10" cy="16.5" r="1.8" />
      <path d="M11.8 16.5v-5l4-1v4.2" />
    </>
  ),

  shield: <path d="M12 3l7.5 3v5.7c0 4.3-3 8-7.5 9.3-4.5-1.3-7.5-5-7.5-9.3V6z" />,

  warning: (
    <>
      <path d="M12 4.5l8.7 15.5H3.3z" />
      <path d="M12 10.5v4" />
      <path d="M12 17.4v.2" />
    </>
  ),
};

export function Icon({ name, className = '', label }: Props) {
  // The presentational width/height below are the fallback size. Any Tailwind
  // w-*/h-* class overrides them, but an icon rendered without one still gets a
  // sane box instead of stretching to fill its flex parent.
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`inline-block shrink-0 ${className}`}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
