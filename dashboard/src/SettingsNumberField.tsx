import { FieldError, Hint } from "./components/ui/Layout";
import { cn } from "./lib/cn";

interface SettingsNumberFieldProps {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  disabled?: boolean;
  variant?: "number" | "slider";
  onChange: (value: number) => void;
}

function formatSliderValue(value: number, step: number): string {
  if (step < 1) {
    const decimals = String(step).includes(".")
      ? (String(step).split(".")[1]?.length ?? 1)
      : 1;
    return value.toFixed(decimals);
  }
  return String(value);
}

export function SettingsNumberField({
  id,
  label,
  hint,
  error,
  value,
  min,
  max,
  step = 1,
  disabled,
  variant = "number",
  onChange,
}: SettingsNumberFieldProps) {
  const invalid = Boolean(error);

  if (variant === "slider") {
    const display = formatSliderValue(value, step);
    return (
      <div
        className={cn(
          "flex flex-col gap-1",
          invalid && "[&_input[type=range]]:outline [&_input[type=range]]:outline-1 [&_input[type=range]]:outline-danger",
        )}
      >
        <label htmlFor={id} className="flex items-baseline justify-between gap-3">
          {label}
          <span className="font-mono text-sm font-semibold text-accent">
            {display}
          </span>
        </label>
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          aria-invalid={invalid}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <div
          className="mt-1 flex justify-between font-mono text-xs text-muted"
          aria-hidden="true"
        >
          <span>{min}</span>
          <span>{max}</span>
        </div>
        {hint ? <Hint>{hint}</Hint> : null}
        {error ? <FieldError>{error}</FieldError> : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-invalid={invalid}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {hint ? <Hint>{hint}</Hint> : null}
      {error ? <FieldError>{error}</FieldError> : null}
    </div>
  );
}
