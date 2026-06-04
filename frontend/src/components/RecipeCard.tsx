import React from "react";
import { useNavigate } from "react-router-dom";
import { Clock } from "lucide-react";
import { DecryptedRecipe, useRecipes } from "../hooks/useRecipes";
import StarRating from "./StarRating";
import { getServerUrl } from "../api/apiClient";

interface RecipeCardProps {
  recipe: DecryptedRecipe;
}

export default function RecipeCard({ recipe }: RecipeCardProps) {
  const navigate = useNavigate();
  const { saveRecipe } = useRecipes();

  const handleRatingChange = async (e: React.MouseEvent, newRating: number) => {
    e.stopPropagation(); // Avoid navigating to details page
    try {
      await saveRecipe({
        ...recipe,
        rating: newRating
      });
    } catch (err) {
      console.error("Failed to update recipe rating from card:", err);
    }
  };

  const handleCardClick = () => {
    navigate(`/recipe/${recipe.id}`);
  };

  // Build full photo URL
  const serverUrl = getServerUrl();
  const photoUrl = recipe.photo_path 
    ? `${serverUrl}${recipe.photo_path.startsWith('/') ? '' : '/'}${recipe.photo_path}` 
    : null;

  return (
    <div 
      onClick={handleCardClick}
      className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm hover:shadow-md cursor-pointer transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 flex flex-col h-full group"
    >
      {/* Recipe Photo / Fallback Illustration */}
      <div className="relative aspect-video w-full overflow-hidden bg-muted/40 border-b border-border">
        {photoUrl ? (
          <img
            src={photoUrl}
            alt={recipe.title}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-103"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-tr from-primary/10 via-primary-light/50 to-primary/5 text-primary/30 p-4">
            <span className="text-4xl filter grayscale-20 opacity-80 group-hover:scale-110 transition-transform duration-300">🍳</span>
          </div>
        )}

        {/* Cooking Time Overlay */}
        <div className="absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-[10px] font-bold text-white backdrop-blur-xs">
          <Clock size={11} />
          <span>{recipe.cookingTimeMinutes} Min.</span>
        </div>
      </div>

      {/* Card Details */}
      <div className="p-4 flex-1 flex flex-col justify-between gap-3">
        <div className="space-y-1">
          {/* Rating */}
          <div className="flex items-center">
            <StarRating 
              rating={recipe.rating} 
              onChange={() => {}} // We will intercept onClick directly in the child stars
              size={14}
              interactive={true}
            />
            {/* Direct onClick interceptor overlay to prevent navigation */}
            <div 
              className="absolute h-6 w-24 bg-transparent cursor-pointer" 
              onClick={(e) => {
                // Determine which star was clicked based on offset
                const rect = e.currentTarget.getBoundingClientRect();
                const clickX = e.clientX - rect.left;
                const starWidth = rect.width / 5;
                const clickedStar = Math.min(5, Math.max(1, Math.ceil(clickX / starWidth)));
                handleRatingChange(e, clickedStar);
              }}
            />
          </div>

          {/* Title */}
          <h3 className="font-bold text-sm tracking-tight text-on-surface line-clamp-2 leading-snug group-hover:text-primary transition-colors">
            {recipe.title}
          </h3>
        </div>

        <div className="space-y-2">
          {/* Dietary Tags (Show max 3 for card spacing) */}
          {recipe.dietaryTags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {recipe.dietaryTags.slice(0, 3).map((tag) => (
                <span 
                  key={tag} 
                  className="rounded-full bg-primary-light text-primary px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide border border-primary/5"
                >
                  {tag}
                </span>
              ))}
              {recipe.dietaryTags.length > 3 && (
                <span className="text-[10px] text-on-surface-muted font-bold self-center">
                  +{recipe.dietaryTags.length - 3}
                </span>
              )}
            </div>
          )}

          {/* Nutrition Calories preview */}
          {recipe.nutrition.caloriesPerServing > 0 && (
            <div className="text-[10px] font-bold text-on-surface-muted border-t border-border/60 pt-2 flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              <span>{Math.round(recipe.nutrition.caloriesPerServing)} kcal pro Portion</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
