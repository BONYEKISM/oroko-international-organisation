import en from "i18n-iso-countries/langs/en.json";

export type CountryOption = { code: string; name: string };

const countryNames = en.countries as Record<string, string | string[]>;
const countryCodes = new Set(Object.keys(countryNames));

function preferredName(value: string | string[]) {
  return typeof value === "string" ? value : value[0] ?? "";
}

export const COUNTRIES: CountryOption[] = Object.entries(countryNames)
  .map(([code, name]) => ({ code, name: preferredName(name) }))
  .sort((a, b) => a.name.localeCompare(b.name, "en"));

export function getCountryName(code?: string): string {
  if (!code) return "";
  const normalizedCode = code.trim().toUpperCase();
  const countryName = countryNames[normalizedCode];
  return countryName ? preferredName(countryName) : code;
}

export function isValidCountryCode(code: string): boolean {
  return countryCodes.has(code.trim().toUpperCase());
}
