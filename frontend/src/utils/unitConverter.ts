export const SUPPORTED_UNITS = ["g", "kg", "ml", "l", "TL", "EL", "Tasse", "Stück", "Prise"];

export const CONVERSION_FACTORS: Record<string, number> = {
  // Weight in grams
  "g": 1.0,
  "kg": 1000.0,
  
  // Volume in ml
  "ml": 1.0,
  "l": 1000.0,
  "tl": 5.0,     // Teaspoon = 5ml
  "el": 15.0,    // Tablespoon = 15ml
  "tasse": 240.0 // Cup = 240ml
};

export function convert(amount: number, from: string, to: string): number | null {
  const fromUnit = from.toLowerCase().trim();
  const toUnit = to.toLowerCase().trim();

  if (fromUnit === toUnit) return amount;

  // Weight conversions
  if ((fromUnit === "g" || fromUnit === "kg") && (toUnit === "g" || toUnit === "kg")) {
    const fromFactor = CONVERSION_FACTORS[fromUnit] || 1;
    const toFactor = CONVERSION_FACTORS[toUnit] || 1;
    return (amount * fromFactor) / toFactor;
  }

  // Volume conversions
  if (
    (fromUnit === "ml" || fromUnit === "l" || fromUnit === "tl" || fromUnit === "el" || fromUnit === "tasse") &&
    (toUnit === "ml" || toUnit === "l" || toUnit === "tl" || toUnit === "el" || toUnit === "tasse")
  ) {
    const fromFactor = CONVERSION_FACTORS[fromUnit] || 1;
    const toFactor = CONVERSION_FACTORS[toUnit] || 1;
    return (amount * fromFactor) / toFactor;
  }

  // No conversion path between weight and volume, or pieces
  return null;
}

export function formatAmount(amount: number, unit: string): string {
  const u = unit.trim();
  const lowerUnit = u.toLowerCase();

  if (lowerUnit === "g" && amount >= 1000) {
    return `${(amount / 1000).toLocaleString("de-DE", { maximumFractionDigits: 2 })} kg`;
  }
  if (lowerUnit === "ml" && amount >= 1000) {
    return `${(amount / 1000).toLocaleString("de-DE", { maximumFractionDigits: 2 })} l`;
  }

  return `${amount.toLocaleString("de-DE", { maximumFractionDigits: 2 })} ${u}`;
}
