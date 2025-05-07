
import * as React from "react"

import { cn } from "@/lib/utils"

// Allow any valid HTML input attributes
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-muted px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          // Specific style override for datetime-local picker indicator if needed
          "dark:[color-scheme:dark]", // Ensures dark mode picker styles are applied
          className
        )}
        ref={ref}
        {...props} // Spread all other props (including min, max, step, etc.)
      />
    )
  }
)
Input.displayName = "Input"

export { Input }


