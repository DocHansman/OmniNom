
interface DietaryTagPickerProps {
  selectedTags: string[];
  onChange: (tags: string[]) => void;
}

export const PRESET_TAGS = [
  "vegan",
  "vegetarisch",
  "glutenfrei",
  "laktosefrei",
  "low-carb",
  "<30min",
  "Meal-Prep",
  "scharf",
  "Suppe",
  "Backen"
];

export default function DietaryTagPicker({ selectedTags, onChange }: DietaryTagPickerProps) {
  const toggleTag = (tag: string) => {
    const isSelected = selectedTags.includes(tag);
    if (isSelected) {
      onChange(selectedTags.filter((t) => t !== tag));
    } else {
      onChange([...selectedTags, tag]);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      {PRESET_TAGS.map((tag) => {
        const isSelected = selectedTags.includes(tag);
        return (
          <button
            key={tag}
            type="button"
            onClick={() => toggleTag(tag)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold tracking-wide border transition-all cursor-pointer select-none active:scale-95 ${
              isSelected
                ? "bg-primary text-white border-primary shadow-sm"
                : "bg-surface text-on-surface-muted border-border hover:bg-muted"
            }`}
          >
            {tag === "scharf" ? "🌶️ " : ""}
            {tag}
          </button>
        );
      })}
    </div>
  );
}
