import React from 'react'

// Primitiva compatible con el patrón de composición de shadcn/ui.
export function Button({ variant = 'default', size = 'default', className = '', ...props }) {
  return <button data-variant={variant} data-size={size} className={className} {...props} />
}
