import type { SVGProps } from 'react'

import type { IconComponent } from '../../types'
const FccLight: IconComponent = (props: SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="none" viewBox="0 0 120 120" {...props}>
    <circle cx={60} cy={60} r={56} fill="#1a1a1a" />
    <path fill="#E8E8E8" d="M44 36H76V44H52V84H44V36Z" />
  </svg>
)
export { FccLight }
export default FccLight
