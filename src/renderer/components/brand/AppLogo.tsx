import type { SVGProps } from 'react'

import logoA1 from '@renderer/assets/logo-a1.svg'

/**
 * AI1 brand mark — the continuous-ribbon "A1" glyph.
 *
 * Renders the original single-stroke logo SVG. `className` is forwarded to the
 * underlying `<img>` so callers can size it with the same token scale they use
 * for icons and text.
 */
export function AppLogo({ className, alt = 'AI1', ...props }: SVGProps<SVGSVGElement> & { alt?: string }) {
  return <img src={logoA1} alt={alt} className={className} {...(props as unknown as Record<string, string>)} />
}

export default AppLogo
