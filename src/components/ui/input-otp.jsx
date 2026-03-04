import * as React from "react"
import { cn } from "@/lib/utils"

const InputOTPContext = React.createContext(null)

const InputOTP = React.forwardRef(function InputOTP(
  { maxLength = 6, value = "", onChange, disabled, className, containerClassName, children, ...props },
  ref
) {
  const inputRef = React.useRef(null)
  React.useImperativeHandle(ref, () => inputRef.current)

  const slots = Array.from({ length: maxLength }, function(_, i) {
    return {
      char: value[i] || null,
      isActive: !disabled && i === value.length,
      hasFakeCaret: !disabled && i === value.length,
    }
  })

  return (
    <InputOTPContext.Provider value={{ slots, maxLength, value, disabled }}>
      <div
        className={cn("flex items-center gap-2", containerClassName)}
        onClick={function() { if (!disabled) inputRef.current && inputRef.current.focus() }}
        {...props}
      >
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          pattern="\d*"
          maxLength={maxLength}
          value={value}
          onChange={function(e) {
            var val = e.target.value.replace(/\D/g, "").slice(0, maxLength)
            onChange(val)
          }}
          disabled={disabled}
          className={cn("sr-only", className)}
          autoComplete="one-time-code"
        />
        {children}
      </div>
    </InputOTPContext.Provider>
  )
})
InputOTP.displayName = "InputOTP"

const InputOTPGroup = React.forwardRef(function InputOTPGroup({ className, ...props }, ref) {
  return <div ref={ref} className={cn("flex items-center", className)} {...props} />
})
InputOTPGroup.displayName = "InputOTPGroup"

const InputOTPSlot = React.forwardRef(function InputOTPSlot({ index, className, ...props }, ref) {
  var context = React.useContext(InputOTPContext)
  var slot = (context && context.slots && context.slots[index]) || { char: null, isActive: false, hasFakeCaret: false }
  var char = slot.char
  var hasFakeCaret = slot.hasFakeCaret
  var isActive = slot.isActive

  return (
    <div
      ref={ref}
      className={cn(
        "relative flex h-9 w-9 items-center justify-center border-y border-r border-input text-sm shadow-sm transition-all first:rounded-l-md first:border-l last:rounded-r-md",
        isActive && "z-10 ring-1 ring-ring",
        className
      )}
      {...props}
    >
      {char}
      {hasFakeCaret && !char && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-4 w-px animate-caret-blink bg-foreground duration-1000" />
        </div>
      )}
    </div>
  )
})
InputOTPSlot.displayName = "InputOTPSlot"

const InputOTPSeparator = React.forwardRef(function InputOTPSeparator(props, ref) {
  return (
    <div ref={ref} role="separator" {...props}>
      <span>—</span>
    </div>
  )
})
InputOTPSeparator.displayName = "InputOTPSeparator"

export { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator }