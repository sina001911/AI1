import { cn } from '../../../../lib/utils'
import type { CompoundIcon, CompoundIconProps } from '../../types'
import { FccAvatar } from './avatar'
import { FccDark } from './dark'
import { FccLight } from './light'

const Fcc = ({ variant, className, ...props }: CompoundIconProps) => {
  if (variant === 'light') return <FccLight {...props} className={className} />
  if (variant === 'dark') return <FccDark {...props} className={className} />
  return (
    <>
      <FccLight className={cn('dark:hidden', className)} {...props} />
      <FccDark className={cn('hidden dark:block', className)} {...props} />
    </>
  )
}

export const FccIcon: CompoundIcon = /*#__PURE__*/ Object.assign(Fcc, {
  Avatar: FccAvatar,
  colorPrimary: '#1a1a1a'
})

export default FccIcon
