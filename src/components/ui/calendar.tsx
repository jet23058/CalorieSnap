

"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { DayPicker, DropdownProps } from "react-day-picker"
import { zhTW } from 'date-fns/locale'; // Import Traditional Chinese locale

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select" // Import Select components


export type CalendarProps = React.ComponentProps<typeof DayPicker>

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  locale = zhTW, // Default locale to Traditional Chinese
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-0 sm:p-4 w-full", className)} // Adjusted padding and added w-full
      locale={locale} // Pass locale to DayPicker
      classNames={{
        months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0 w-full", // Added w-full
        month: "space-y-4 w-full", // Added w-full
        caption: "flex justify-center pt-1 relative items-center",
        caption_label: "text-sm font-medium hidden", // Hide default label when using dropdowns
        caption_dropdowns: "flex justify-center gap-2 items-center w-full px-2", // Ensure dropdowns can take full width
        nav: "space-x-1 flex items-center",
        nav_button: cn(
          buttonVariants({ variant: "outline" }),
          "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100"
        ),
        nav_button_previous: "absolute left-1",
        nav_button_next: "absolute right-1",
        table: "w-full border-collapse space-y-1",
        head_row: "flex justify-around", // Distribute headers evenly
        head_cell:
          "text-muted-foreground rounded-md w-[14.28%] font-normal text-[0.8rem]", // Use percentages for width
        row: "flex w-full mt-2 justify-around", // Distribute cells evenly
        cell: cn(
          "h-9 w-[14.28%] text-center text-sm p-0 relative", // Use percentages
          "[&:has([aria-selected])]:rounded-md", // Apply accent and rounding to the cell itself when selected
          "[&:has([aria-selected].day-outside)]:bg-accent/50", // Style for selected outside days
          "[&:has([aria-selected].day-range-end)]:rounded-r-md",
          "first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md"
          // Removed focus-within styles causing orange ring
        ),
        day: cn(
          buttonVariants({ variant: "ghost" }),
          "h-9 w-full p-0 font-normal aria-selected:opacity-100", // Make day button full width of cell
          // Remove focus ring specifically for calendar day
          "focus-visible:ring-0 focus-visible:ring-offset-0"
        ),
        day_range_end: "day-range-end",
        day_selected:
          "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground", // Standard selected day style
        day_today: "bg-accent text-accent-foreground", // Kept today style
        day_outside:
          "day-outside text-muted-foreground opacity-50 aria-selected:bg-accent/50 aria-selected:text-muted-foreground aria-selected:opacity-30", // Adjusted outside day opacity
        day_disabled: "text-muted-foreground opacity-50",
        day_range_middle:
          "aria-selected:bg-accent aria-selected:text-accent-foreground",
        day_hidden: "invisible",
        vhidden: "hidden", // Ensure vhidden hides elements
        ...classNames,
      }}
      components={{
        IconLeft: ({ className: iconClassName, ...iconProps }) => ( // Renamed className to avoid conflict
          <ChevronLeft className={cn("h-4 w-4", iconClassName)} {...iconProps} />
        ),
        IconRight: ({ className: iconClassName, ...iconProps }) => (  // Renamed className to avoid conflict
          <ChevronRight className={cn("h-4 w-4", iconClassName)} {...iconProps} />
        ),
        // Custom dropdown component using ShadCN Select
         Dropdown: ({ value, onChange, children, ...dropdownProps }: DropdownProps) => {
           const options = React.Children.toArray(children) as React.ReactElement<React.HTMLProps<HTMLOptionElement>>[];
           const currentOption = options.find((option) => option.props.value === value);
           const handleChange = (newValue: string) => {
             const changeEvent = {
               target: { value: newValue },
             } as React.ChangeEvent<HTMLSelectElement>;
             onChange?.(changeEvent);
           };
           return (
             <Select
               value={value?.toString()}
               onValueChange={(newValue) => handleChange(newValue)}
             >
               <SelectTrigger
                 className={cn(
                    "h-8 text-sm font-medium flex-1 rounded-md px-2 py-1",
                    "border border-input bg-input hover:bg-accent/10", // More prominent styling
                    "focus:ring-ring focus:ring-2 focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-0" // Standard focus
                 )}
                >
                 <SelectValue>{currentOption?.props.children}</SelectValue>
               </SelectTrigger>
               <SelectContent className="max-h-[var(--radix-select-content-available-height)] overflow-y-auto scrolling-touch">
                 {options.map((option, id: number) => (
                   <SelectItem
                     key={`${option.props.value}-${id}`}
                     value={option.props.value?.toString() ?? ""}
                   >
                     {option.props.children}
                   </SelectItem>
                 ))}
               </SelectContent>
             </Select>
           );
         },
      }}
      captionLayout="dropdown-buttons" // Explicitly keep dropdown layout
      {...props}
    />
  )
}
Calendar.displayName = "Calendar"

export { Calendar }





