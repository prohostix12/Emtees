import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { COUNTRIES, Country } from "@contracts/countries";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { validatePhoneNumber } from "@contracts/validation";
import { Field, FieldLabel, FieldError, FieldDescription } from "@/components/ui/field";

export interface PhoneNumberInputProps {
  label?: string;
  description?: string;
  countryCode: string;
  countryISO: string;
  value: string;
  onChange: (data: {
    countryCode: string;
    countryISO: string;
    phoneNumber: string;
    fullNumber: string;
    isValid: boolean;
    error: string | null;
  }) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  id?: string;
  error?: string | null;
}

export function PhoneNumberInput({
  label,
  description,
  countryCode,
  countryISO,
  value,
  onChange,
  placeholder = "Phone number",
  disabled = false,
  required = false,
  className,
  id,
  error: externalError,
}: PhoneNumberInputProps) {
  const [open, setOpen] = React.useState(false);
  const [localNumber, setLocalNumber] = React.useState(value);
  const [touched, setTouched] = React.useState(false);

  React.useEffect(() => {
    setLocalNumber(value);
  }, [value]);

  const selectedCountry = React.useMemo(() => {
    const isoUpper = (countryISO || "").toUpperCase();
    const codeClean = (countryCode || "").trim();
    
    return (
      COUNTRIES.find((c) => c.iso.toUpperCase() === isoUpper) ||
      COUNTRIES.find((c) => c.code === codeClean) ||
      COUNTRIES.find((c) => c.iso === "IN")!
    );
  }, [countryCode, countryISO]);

  const internalError = React.useMemo(() => {
    if (!localNumber && !required) return null;
    return validatePhoneNumber(selectedCountry.code, localNumber, selectedCountry.iso);
  }, [selectedCountry, localNumber, required]);

  const displayError = externalError || (touched || localNumber ? internalError : null);

  const handleCountrySelect = (country: Country) => {
    setOpen(false);
    const cleanNum = localNumber.replace(/\D/g, "");
    const fullNumber = `${country.code}${cleanNum}`;
    const errorMsg = validatePhoneNumber(country.code, cleanNum, country.iso);
    
    onChange({
      countryCode: country.code,
      countryISO: country.iso,
      phoneNumber: cleanNum,
      fullNumber: fullNumber.startsWith("+") ? fullNumber : `+${fullNumber}`,
      isValid: !errorMsg,
      error: errorMsg,
    });
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, "");
    setLocalNumber(val);

    const fullNumber = `${selectedCountry.code}${val}`;
    const errorMsg = validatePhoneNumber(selectedCountry.code, val, selectedCountry.iso);

    onChange({
      countryCode: selectedCountry.code,
      countryISO: selectedCountry.iso,
      phoneNumber: val,
      fullNumber: fullNumber.startsWith("+") ? fullNumber : `+${fullNumber}`,
      isValid: !errorMsg,
      error: errorMsg,
    });
  };

  const handleBlur = () => {
    setTouched(true);
  };

  const inputId = id || React.useId();

  const content = (
    <div className="flex items-center gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="flex h-9 w-[110px] shrink-0 items-center justify-between rounded-md border px-2 py-1 text-sm bg-white dark:bg-slate-900 border-input shadow-xs"
            disabled={disabled}
          >
            <span className="flex items-center gap-1.5 min-w-0">
              <span className="text-base leading-none shrink-0">{selectedCountry.flag}</span>
              <span className="text-xs font-mono font-medium truncate">{selectedCountry.code}</span>
            </span>
            <ChevronsUpDown className="ml-1 size-3 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[300px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search country name, code, or ISO..." />
            <CommandList>
              <CommandEmpty>No country found.</CommandEmpty>
              <CommandGroup>
                {COUNTRIES.map((c) => (
                  <CommandItem
                    key={`${c.iso}-${c.code}`}
                    value={`${c.name} ${c.code} ${c.iso}`}
                    onSelect={() => handleCountrySelect(c)}
                    className="flex items-center justify-between cursor-pointer px-2 py-1.5"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-lg leading-none shrink-0">{c.flag}</span>
                      <span className="truncate text-xs font-medium text-gray-700 dark:text-gray-200">
                        {c.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-[10px] font-mono text-gray-400 font-bold uppercase">{c.iso}</span>
                      <span className="text-xs font-mono font-bold text-emerald-600">{c.code}</span>
                      {selectedCountry.iso === c.iso && (
                        <Check className="ml-1 size-3.5 text-emerald-600" />
                      )}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <Input
        id={inputId}
        type="tel"
        placeholder={placeholder}
        value={localNumber}
        onChange={handlePhoneChange}
        onBlur={handleBlur}
        disabled={disabled}
        required={required}
        aria-invalid={!!displayError}
        className="flex-1"
      />
    </div>
  );

  if (label || description || displayError) {
    return (
      <Field className={className} data-invalid={!!displayError}>
        {label && (
          <FieldLabel htmlFor={inputId}>
            {label}
            {required && <span className="text-red-500 ml-0.5">*</span>}
          </FieldLabel>
        )}
        {content}
        {description && <FieldDescription>{description}</FieldDescription>}
        {displayError && <FieldError>{displayError}</FieldError>}
      </Field>
    );
  }

  return <div className={className}>{content}</div>;
}
