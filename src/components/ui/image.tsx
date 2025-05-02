// NOTE: This is a placeholder for the actual ShadCN UI Image component.
// The real component would typically be installed via CLI or copied from their docs.
// For now, we'll create a basic wrapper around next/image.

"use client"

import * as React from "react"
import NextImage, { ImageProps as NextImageProps } from "next/image"
import { cn } from "@/lib/utils"

// Define props, extending NextImageProps
interface ImageProps extends NextImageProps {
  // Add any custom props specific to your ShadCN-like Image component here
  // For example: rounded?: "sm" | "md" | "lg" | "full";
}

const Image = React.forwardRef<HTMLImageElement, ImageProps>(
  ({ className, alt, ...props }, ref) => {
    // You might add default props or logic here based on ShadCN style
    // For example, adding default sizes or quality settings.

    return (
      <NextImage
        ref={ref} // Forwarding ref might require adjustments depending on NextImage version
        className={cn(
          // Add default ShadCN image styles if any
          // e.g., "block max-w-full h-auto align-middle",
          className // Allow overriding styles
        )}
        alt={alt || ""} // Ensure alt text is always present, even if empty
        {...props} // Spread the rest of the NextImage props
      />
    )
  }
)
Image.displayName = "Image"

export { Image }
export type { ImageProps }
