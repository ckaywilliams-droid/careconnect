import * as React from "react"
import { cn } from "@/lib/utils"

const InputOTPContext = React.createContext(null)

const InputOTP = React.forwardRef(function InputOTP(allProps, ref) {
  var maxLength = allProps.maxLength !== undefined ? allProps.maxLength : 6
  var value = allProps.value !== undefined ? allProps.value : ""
  var onChange = allProps.onChange
  var disabled = allProps.disabled
  var className = allProps.className
  var containerClassName = allProps.containerClassName
  var children = allProps.children

  var inputRef = React.useRef(null)
  React.useImperativeHandle(ref, function() { return inputRef.current })

  var slots = Array.from({ length: maxLength }, function(_, i) {
    return {
      char: value[i] || null,
      isActive: !disabled && i === value.length,
      hasFakeCaret: !disabled && i === value.length,
    }
  })

  return (
    <InputOTPContext.Provider value={{ slots: slots, maxLength: maxLength, value: value, disabled: disabled }}>
      <div
        className={cn("flex items-center gap-2", containerClassName)}
        onClick={function() { if (!disabled && inputRef.current) inputRef.current.focus() }}
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
            if (onChange) onChange(val)
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

const InputOTPGroup = React.forwardRef(function InputOTPGroup(allProps, ref) {
  var className = allProps.className
  var rest = Object.assign({}, allProps)
  delete rest.className
  return <div ref={ref} className={cn("flex items-center", className)} {...rest} />
})
InputOTPGroup.displayName = "InputOTPGroup"

const InputOTPSlot = React.forwardRef(function InputOTPSlot(allProps, ref) {
  var index = allProps.index
  var className = allProps.className
  var rest = Object.assign({}, allProps)
  delete rest.index
  delete rest.className

  var context = React.useContext(InputOTPContext)
  var defaultSlot = { char: null, isActive: false, hasFakeCaret: false }
  var slot = (context && context.slots && context.slots[index]) ? context.slots[index] : defaultSlot
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
      {...rest}
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
      <span>-</span>
    </div>
  )
})
InputOTPSeparator.displayName = "InputOTPSeparator"

export { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator }