"use client";

import { Label } from "@/components/ui/label";
import { COUNTRIES } from "@/lib/countries";

type Props = {
  id: string;
  value: string;
  onChange: (value: string) => void;
};

export function CountrySelect({ id, value, onChange }: Props) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>Country</Label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required
        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <option value="">Select a country</option>
        {COUNTRIES.map((country) => (
          <option key={country.code} value={country.code}>
            {country.name}
          </option>
        ))}
      </select>
    </div>
  );
}
