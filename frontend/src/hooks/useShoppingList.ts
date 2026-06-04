import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../App";
import { 
  getLocalShoppingList, 
  putLocalShoppingListItem, 
  deleteLocalShoppingListItem,
  ShoppingListLocal,
  getDb
} from "../db/localDb";
import { encrypt, decrypt } from "../crypto/cryptoEngine";
import { useInventory } from "./useInventory";
import { DecryptedRecipe } from "./useRecipes";
import { convert } from "../utils/unitConverter";
import { getShoppingCategory as getCategory } from "../utils/categorizer";

export interface ShoppingItem {
  id: string;
  name: string;
  amount: number;
  unit: string;
  category: string;
  is_checked: boolean;
  updated_at: string;
}

export { getCategory };

export function useShoppingList() {
  const { cryptoKey, userId } = useAuth();
  const queryClient = useQueryClient();
  const { inventoryItems, addItemsToInventory } = useInventory();

  // Query: Get and decrypt all shopping list items
  const { data: shoppingItems = [], isLoading } = useQuery<ShoppingItem[]>({
    queryKey: ["shoppingList"],
    queryFn: async () => {
      if (!cryptoKey) return [];
      const localItems = await getLocalShoppingList();
      
      const decryptedList: ShoppingItem[] = [];
      for (const raw of localItems) {
        try {
          const payloadStr = await decrypt(cryptoKey, raw.encrypted_payload);
          const payload = JSON.parse(payloadStr);

          decryptedList.push({
            id: raw.id,
            is_checked: raw.is_checked,
            updated_at: raw.updated_at,
            name: payload.name || "Unbenanntes Produkt",
            amount: payload.amount || 1,
            unit: payload.unit || "Stück",
            category: payload.category || "Sonstiges"
          });
        } catch (e) {
          console.error(`Failed to decrypt shopping item ${raw.id}:`, e);
        }
      }
      return decryptedList;
    },
    enabled: !!cryptoKey
  });

  // Mutation: Save (Create/Update) shopping item
  const saveShoppingItemMutation = useMutation({
    mutationFn: async (item: Omit<ShoppingItem, "id" | "updated_at" | "is_checked"> & { id?: string, is_checked?: boolean }) => {
      if (!cryptoKey) throw new Error("No E2EE key available");

      const id = item.id || window.crypto.randomUUID();
      const isChecked = item.is_checked ?? false;
      const payload = {
        name: item.name,
        amount: item.amount,
        unit: item.unit,
        category: item.category
      };

      const encryptedStr = await encrypt(cryptoKey, JSON.stringify(payload));
      const updatedAt = new Date().toISOString();

      const localRecord: ShoppingListLocal = {
        id,
        encrypted_payload: encryptedStr,
        is_checked: isChecked,
        updated_at: updatedAt
      };

      await putLocalShoppingListItem(localRecord, true);
      return localRecord;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shoppingList"] });
      window.dispatchEvent(new CustomEvent("trigger-background-sync"));
    }
  });

  // Mutation: Toggle Check/Uncheck Shopping Item
  const toggleCheckItemMutation = useMutation({
    mutationFn: async ({ id, isChecked }: { id: string, isChecked: boolean }) => {
      if (!cryptoKey) throw new Error("No E2EE key available");

      const db = await getDb();
      const raw = await db.get("shoppingList", id);
      if (!raw) return;

      const updatedAt = new Date().toISOString();
      const updatedRecord: ShoppingListLocal = {
        ...raw,
        is_checked: isChecked,
        updated_at: updatedAt
      };

      await putLocalShoppingListItem(updatedRecord, true);

      // Inventory Transfer Trigger: If checked, add items immediately to inventory stock!
      if (isChecked) {
        try {
          const payloadStr = await decrypt(cryptoKey, raw.encrypted_payload);
          const payload = JSON.parse(payloadStr);
          
          const name = payload.name;
          const amount = payload.amount;
          const unit = payload.unit;

          // Directly call the safe addItemsToInventory batch logic to avoid stale snapshots and race conditions!
          await addItemsToInventory([{ name, amount, unit }]);
        } catch (err) {
          console.error("Failed to transfer shopping item to inventory", err);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shoppingList"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", userId] });
      window.dispatchEvent(new CustomEvent("trigger-background-sync"));
    }
  });

  // Mutation: Delete shopping item
  const deleteShoppingItemMutation = useMutation({
    mutationFn: async (id: string) => {
      await deleteLocalShoppingListItem(id, true);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shoppingList"] });
      window.dispatchEvent(new CustomEvent("trigger-background-sync"));
    }
  });

  // ----------------------------------------------------
  // INTELLIGENT GROCERY GAP CALCULATOR
  // ----------------------------------------------------
  const calculateShoppingNeeds = async (recipesList: DecryptedRecipe[], mealPlans: any[]) => {
    if (!cryptoKey || !userId) return;

    console.log("Calculating meal plan grocery gaps against inventory stock...");

    // 1. Calculate total ingredient needs across meal plan
    const neededMap = new Map<string, { name: string; amount: number; unit: string }>();

    for (const plan of mealPlans) {
      const recipe = recipesList.find((r) => r.id === plan.recipe_id);
      if (!recipe) continue;

      const factor = plan.servings / recipe.servings;
      for (const ing of recipe.ingredients) {
        const key = `${ing.name.toLowerCase().trim()}_${ing.unit.toLowerCase().trim()}`;
        const current = neededMap.get(key) || { name: ing.name, amount: 0.0, unit: ing.unit };
        current.amount += ing.amount * factor;
        neededMap.set(key, current);
      }
    }

    // 2. Subtract inventory items (checking with unit conversion)
    const itemsToBuy: Omit<ShoppingItem, "id" | "is_checked" | "updated_at">[] = [];

    for (const needed of neededMap.values()) {
      // Find matching items in inventory
      let inStockAmount = 0.0;
      const matchingInvItems = inventoryItems.filter(
        (i) => i.name.toLowerCase().trim() === needed.name.toLowerCase().trim()
      );

      for (const inv of matchingInvItems) {
        const converted = convert(inv.amount, inv.unit, needed.unit);
        if (converted !== null) {
          inStockAmount += converted;
        }
      }

      const diff = needed.amount - inStockAmount;
      if (diff > 0.01) { // Floating point correction
        itemsToBuy.push({
          name: needed.name,
          amount: parseFloat(diff.toFixed(2)),
          unit: needed.unit,
          category: getCategory(needed.name)
        });
      }
    }

    // 3. Merge gaps into active shopping list (prevent duplicates)
    for (const item of itemsToBuy) {
      const existing = shoppingItems.find(
        (i) => !i.is_checked && 
               i.name.toLowerCase().trim() === item.name.toLowerCase().trim() && 
               i.unit.toLowerCase().trim() === item.unit.toLowerCase().trim()
      );

      if (existing) {
        // If the gap has changed, update it
        if (Math.abs(existing.amount - item.amount) > 0.05) {
          await saveShoppingItemMutation.mutateAsync({
            id: existing.id,
            name: existing.name,
            amount: item.amount,
            unit: existing.unit,
            category: existing.category,
            is_checked: false
          });
        }
      } else {
        // Create new item
        await saveShoppingItemMutation.mutateAsync({
          name: item.name,
          amount: item.amount,
          unit: item.unit,
          category: item.category
        });
      }
    }
  };

  // Clear all checked items
  const clearCheckedItems = async () => {
    const checked = shoppingItems.filter(i => i.is_checked);
    for (const item of checked) {
      await deleteShoppingItemMutation.mutateAsync(item.id);
    }
  };

  return {
    shoppingItems,
    isLoading: isLoading && !!cryptoKey,
    saveItem: saveShoppingItemMutation.mutateAsync,
    toggleCheckItem: toggleCheckItemMutation.mutateAsync,
    deleteItem: deleteShoppingItemMutation.mutateAsync,
    calculateShoppingNeeds,
    clearCheckedItems
  };
}
