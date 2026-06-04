import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../App";
import { 
  getAllLocalRecipes, 
  putLocalRecipe, 
  getLocalRecipe, 
  RecipeLocal 
} from "../db/localDb";
import { encrypt, decrypt } from "../crypto/cryptoEngine";

export interface Ingredient {
  name: string;
  amount: number;
  unit: string;
}

export interface Step {
  order: number;
  description: string;
  timerMinutes: number | null;
}

export interface Nutrition {
  caloriesPerServing: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
}

export interface DecryptedRecipe {
  id: string;
  title: string;
  servings: number;
  cookingTimeMinutes: number;
  source: string;
  dietaryTags: string[];
  ingredients: Ingredient[];
  steps: Step[];
  nutrition: Nutrition;
  photo_path: string | null;
  rating: number | null;
  updated_at: string;
  is_deleted: boolean;
}

export function useRecipes() {
  const { cryptoKey } = useAuth();
  const queryClient = useQueryClient();

  // 1. Query: Fetch and decrypt all recipes from IndexedDB
  const { data: recipes = [], isLoading, error } = useQuery<DecryptedRecipe[]>({
    queryKey: ["recipes", cryptoKey ? "active" : "none"],
    queryFn: async () => {
      if (!cryptoKey) return [];
      const localRecipes = await getAllLocalRecipes();
      
      const decryptedList: DecryptedRecipe[] = [];
      for (const raw of localRecipes) {
        try {
          const payloadStr = await decrypt(cryptoKey, raw.encrypted_payload);
          const payload = JSON.parse(payloadStr);

          decryptedList.push({
            id: raw.id,
            photo_path: raw.photo_path,
            dietaryTags: raw.dietary_tags,
            rating: raw.rating,
            updated_at: raw.updated_at,
            is_deleted: raw.is_deleted,
            
            // Decrypted properties
            title: payload.title || "Unbenanntes Rezept",
            servings: payload.servings || 2,
            cookingTimeMinutes: payload.cookingTimeMinutes || 30,
            source: payload.source || "",
            ingredients: payload.ingredients || [],
            steps: payload.steps || [],
            nutrition: payload.nutrition || { caloriesPerServing: 0, proteinG: 0, fatG: 0, carbsG: 0 }
          });
        } catch (e) {
          console.error(`Failed to decrypt recipe ${raw.id}:`, e);
          // Keep showing base card even if decryption fails (as fallback)
          decryptedList.push({
            id: raw.id,
            title: "🔒 Verschlüsseltes Rezept",
            servings: 2,
            cookingTimeMinutes: 30,
            source: "",
            dietaryTags: raw.dietary_tags,
            ingredients: [],
            steps: [],
            nutrition: { caloriesPerServing: 0, proteinG: 0, fatG: 0, carbsG: 0 },
            photo_path: raw.photo_path,
            rating: raw.rating,
            updated_at: raw.updated_at,
            is_deleted: raw.is_deleted
          });
        }
      }
      return decryptedList;
    },
    enabled: !!cryptoKey,
  });

  // 2. Mutation: Save (Create/Update) Recipe
  const saveRecipeMutation = useMutation({
    mutationFn: async (recipe: Omit<DecryptedRecipe, "updated_at" | "is_deleted">) => {
      if (!cryptoKey) throw new Error("No E2EE key available");

      const payload = {
        title: recipe.title,
        servings: recipe.servings,
        cookingTimeMinutes: recipe.cookingTimeMinutes,
        source: recipe.source,
        ingredients: recipe.ingredients,
        steps: recipe.steps,
        nutrition: recipe.nutrition
      };

      const encryptedStr = await encrypt(cryptoKey, JSON.stringify(payload));
      const updatedAt = new Date().toISOString();

      const localRecord: RecipeLocal = {
        id: recipe.id,
        encrypted_payload: encryptedStr,
        photo_path: recipe.photo_path,
        dietary_tags: recipe.dietaryTags,
        rating: recipe.rating,
        updated_at: updatedAt,
        is_deleted: false
      };

      await putLocalRecipe(localRecord, true);
      return localRecord;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recipes"] });
      // Trigger background sync
      window.dispatchEvent(new CustomEvent("trigger-background-sync"));
    }
  });

  // 3. Mutation: Delete Recipe (Soft Delete)
  const deleteRecipeMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!cryptoKey) throw new Error("No E2EE key available");

      const raw = await getLocalRecipe(id);
      if (!raw) return;

      const updatedAt = new Date().toISOString();
      const deletedRecord: RecipeLocal = {
        ...raw,
        is_deleted: true,
        updated_at: updatedAt
      };

      await putLocalRecipe(deletedRecord, true);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recipes"] });
      // Trigger background sync
      window.dispatchEvent(new CustomEvent("trigger-background-sync"));
    }
  });

  // 4. Scaling Utility
  const scaleIngredients = (ingredients: Ingredient[], originalServings: number, targetServings: number): Ingredient[] => {
    if (originalServings <= 0 || targetServings <= 0) return ingredients;
    const factor = targetServings / originalServings;
    return ingredients.map(ing => ({
      ...ing,
      amount: parseFloat((ing.amount * factor).toFixed(2))
    }));
  };

  return {
    recipes,
    isLoading: isLoading && !!cryptoKey,
    error,
    saveRecipe: saveRecipeMutation.mutateAsync,
    isSaving: saveRecipeMutation.isPending,
    deleteRecipe: deleteRecipeMutation.mutateAsync,
    isDeleting: deleteRecipeMutation.isPending,
    scaleIngredients
  };
}
