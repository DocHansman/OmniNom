import { X } from "lucide-react";
import { convert, formatAmount } from "../utils/unitConverter";

interface UnitConverterWidgetProps {
  amount: number;
  unit: string;
  onClose: () => void;
}

export default function UnitConverterWidget({ amount, unit, onClose }: UnitConverterWidgetProps) {
  const currentUnit = unit.toLowerCase().trim();
  
  const isWeight = currentUnit === "g" || currentUnit === "kg";
  const isVolume = currentUnit === "ml" || currentUnit === "l" || currentUnit === "tl" || currentUnit === "el" || currentUnit === "tasse";

  const getConversions = () => {
    const list: { val: number; unit: string }[] = [];
    
    if (isWeight) {
      const targets = ["g", "kg"].filter((u) => u !== currentUnit);
      targets.forEach((t) => {
        const converted = convert(amount, unit, t);
        if (converted !== null) list.push({ val: converted, unit: t });
      });
    } else if (isVolume) {
      const targets = ["ml", "l", "TL", "EL", "Tasse"].filter((u) => u.toLowerCase() !== currentUnit);
      targets.forEach((t) => {
        const converted = convert(amount, unit, t);
        if (converted !== null) list.push({ val: converted, unit: t });
      });
    }

    return list;
  };

  const conversions = getConversions();

  return (
    <div className="absolute z-20 mt-1.5 rounded-xl border border-border bg-surface p-3 shadow-lg animate-scale-in text-xs w-48">
      <div className="flex items-center justify-between border-b border-border pb-1.5 mb-2">
        <span className="font-bold text-primary">Einheiten-Konverter</span>
        <button onClick={onClose} className="p-0.5 rounded hover:bg-muted text-on-surface-muted cursor-pointer">
          <X size={12} />
        </button>
      </div>

      <div className="text-[10px] text-on-surface-muted font-semibold uppercase tracking-wider mb-1">
        Original: {formatAmount(amount, unit)}
      </div>

      {conversions.length === 0 ? (
        <div className="text-[11px] text-on-surface-muted italic py-1">
          Keine sinnvollen Umrechnungen für diese Einheit.
        </div>
      ) : (
        <ul className="space-y-1">
          {conversions.map((conv) => (
            <li key={conv.unit} className="flex justify-between items-center py-0.5 border-b border-muted/50 last:border-0">
              <span className="font-medium text-on-surface-muted">{conv.unit}:</span>
              <span className="font-bold text-on-surface">
                {conv.val.toLocaleString("de-DE", { maximumFractionDigits: 2 })} {conv.unit}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
