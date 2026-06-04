import { useState } from "react";
import { Star } from "lucide-react";

interface StarRatingProps {
  rating: number | null;
  onChange?: (rating: number) => void;
  size?: number;
  interactive?: boolean;
}

export default function StarRating({ 
  rating = 0, 
  onChange, 
  size = 20, 
  interactive = false 
}: StarRatingProps) {
  const [hoverRating, setHoverRating] = useState<number | null>(null);

  const currentRating = hoverRating !== null ? hoverRating : (rating || 0);

  const handleClick = (val: number) => {
    if (interactive && onChange) {
      onChange(val);
    }
  };

  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => handleClick(star)}
          onMouseEnter={() => interactive && setHoverRating(star)}
          onMouseLeave={() => interactive && setHoverRating(null)}
          disabled={!interactive}
          className={`transition-transform duration-100 ${
            interactive ? "cursor-pointer hover:scale-115 active:scale-95" : "cursor-default"
          }`}
          style={{ width: size, height: size }}
        >
          <Star
            size={size}
            className={`${
              star <= currentRating
                ? "fill-primary text-primary"
                : "text-border dark:text-muted fill-transparent"
            } transition-colors duration-150`}
          />
        </button>
      ))}
    </div>
  );
}
