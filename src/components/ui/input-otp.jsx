import * as React from "react"
import { cn } from "@/lib/utils"

// Custom OTP input implementation (no external input-otp dependency)
const InputOTPContext = React.createContext(null)

const InputOTP = React.forwardRef(
  ({ maxLength = 6, value = "", onChange, disabled, className, containerClassName, ...props }, ref) => {
    const inputRef = React.useRef(null)

    React.useImperativeHandle(ref, () => inputRef.current)

    const handleKeyDown = (e) => {
      if (e.key === "Backspace") {
        e.preventDefault()
        onChange(value.slice(0, -1))
      } else if (/^\d$/.test(e.key) && value.length < maxLength) {
        e.preventDefault()
        onChange(value + e.key)
      }
    }

    const slots = Array.from({ length: maxLength }, (_, i) => ({
      char: value[i] || null,
      isActive: !disabled && i === value.length,
      hasFakeCaret: !disabled && i === value.length,
    }))

    return (
      <InputOTPContext.Provider value={{ slots, maxLength, value, disabled }}>
        <div
          className={cn("flex items-center gap-2 has-[:disabled]:opacity-50", containerClassName)}
          onClick={() => !disabled && inputRef.current?.focus()}
          {...props}
        >
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            pattern="\d*"
            maxLength={maxLength}
            value={value}
            onChange={(e) => {
              const val = e.target.value.replace(/\D/g, "").slice(0, maxLength)
              onChange(val)
            }}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            className={cn("sr-only", className)}
            autoComplete="one-time-code"
          />
          {props.children}
        </div>
      </InputOTPContext.Provider>
    )
  }
)
InputOTP.displayName = "InputOTP"

const InputOTPGroup = React.forwardRef(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex items-center", className)} {...props} />
  )
)
InputOTPGroup.displayName = "InputOTPGroup"

const InputOTPSlot = React.forwardRef(
  ({ index, className, ...props }, ref) => {
    const context = React.useContext(InputOTPContext)
    const slot = context?.slots?.[index] || { char: null, isActive: false, hasFakeCaret: false }
    const { char, hasFakeCaret, isActive } = slot

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
  }
)
InputOTPSlot.displayName = "InputOTPSlot"

const InputOTPSeparator = React.forwardRef(({ ...props }, ref) => (
  <div ref={ref} role="separator" {...props}>
    <span>—</span>
  </div>
))
InputOTPSeparator.displayName = "InputOTPSeparator"

export { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator }