import type { SVGProps } from 'react'

import type { IconComponent } from '../../types'
const FccDark: IconComponent = (props: SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="none" viewBox="0 0 120 120" {...props}>
    <circle cx={60} cy={60} r={56} fill="#E8E8E8" />
    <path fill="#1a1a1a" d="M44 36H76V44H52V84H44V36Z" />
  </svg>
)
export { FccDark }
export default FccDark
