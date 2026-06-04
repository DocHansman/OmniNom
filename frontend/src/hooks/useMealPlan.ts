import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  getLocalMealPlan, 
  putLocalMealPlanItem, 
  deleteLocalMealPlanItem, 
  MealPlanLocal 
} from "../db/localDb";

export function useMealPlan() {
  const queryClient = useQueryClient();

  // Query: Get all meal plan items
  const { data: mealPlan = [], isLoading } = useQuery<MealPlanLocal[]>({
    queryKey: ["mealPlan"],
    queryFn: async () => {
      return getLocalMealPlan();
    }
  });

  // Mutation: Add recipe to meal plan
  const addToMealPlanMutation = useMutation({
    mutationFn: async (item: Omit<MealPlanLocal, "id" | "updated_at">) => {
      const id = window.crypto.randomUUID();
      const updatedAt = new Date().toISOString();
      const newRecord: MealPlanLocal = {
        id,
        ...item,
        updated_at: updatedAt
      };
      await putLocalMealPlanItem(newRecord, true);
      return newRecord;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mealPlan"] });
      window.dispatchEvent(new CustomEvent("trigger-background-sync"));
      // Trigger a shopping list calculation event
      window.dispatchEvent(new CustomEvent("recalculate-shopping-list"));
    }
  });

  // Mutation: Delete item from meal plan
  const removeFromMealPlanMutation = useMutation({
    mutationFn: async (id: string) => {
      await deleteLocalMealPlanItem(id, true);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mealPlan"] });
      window.dispatchEvent(new CustomEvent("trigger-background-sync"));
      window.dispatchEvent(new CustomEvent("recalculate-shopping-list"));
    }
  });

  return {
    mealPlan,
    isLoading,
    addToMealPlan: addToMealPlanMutation.mutateAsync,
    removeFromMealPlan: removeFromMealPlanMutation.mutateAsync
  };
}
