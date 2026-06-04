import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../App";
import { getDb, putLocalInventoryItem, InventoryLocal } from "../db/localDb";
import { encrypt, decrypt } from "../crypto/cryptoEngine";
import { getInventoryCategory } from "../utils/categorizer";
import { markIngredientAsDepleted, removeIngredientFromDepleted } from "../utils/depletedTracker";

export interface InventoryItem {
  id: string;
  name: string;
  amount: number;
  unit: string;
  category?: string;
  isEstimate?: boolean;
}

export { getInventoryCategory };

export function useInventory() {
  const { userId, cryptoKey } = useAuth();
  const queryClient = useQueryClient();

  // Query: Get and decrypt the inventory list
  const { data: inventoryItems = [], isLoading } = useQuery<InventoryItem[]>({
    queryKey: ["inventory", userId],
    queryFn: async () => {
      if (!cryptoKey || !userId) return [];
      const db = await getDb();
      const raw = await db.get("inventory", userId); // Keyed by userId for single-document E2EE
      
      if (!raw) return [];

      try {
        const decryptedStr = await decrypt(cryptoKey, raw.encrypted_payload);
        return JSON.parse(decryptedStr) as InventoryItem[];
      } catch (e) {
        console.error("Failed to decrypt inventory:", e);
        return [];
      }
    },
    enabled: !!cryptoKey && !!userId
  });

  // Mutation: Overwrite the entire inventory list
  const updateInventoryMutation = useMutation({
    mutationFn: async (items: InventoryItem[]) => {
      if (!cryptoKey || !userId) throw new Error("Credentials missing");

      const payloadStr = JSON.stringify(items);
      const encryptedStr = await encrypt(cryptoKey, payloadStr);
      const updatedAt = new Date().toISOString();

      const localRecord: InventoryLocal = {
        id: userId,
        encrypted_payload: encryptedStr,
        updated_at: updatedAt
      };

      await putLocalInventoryItem(localRecord, true);
      return items;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory", userId] });
      window.dispatchEvent(new CustomEvent("trigger-background-sync"));
      window.dispatchEvent(new CustomEvent("recalculate-shopping-list"));
    }
  });

  const saveItem = async (item: Omit<InventoryItem, "id"> & { id?: string, category?: string, isEstimate?: boolean }) => {
    return navigator.locks.request("inventory-lock", async () => {
      if (!cryptoKey || !userId) throw new Error("Credentials missing");

      const db = await getDb();
      const raw = await db.get("inventory", userId);
      let items: InventoryItem[] = [];
      if (raw) {
        try {
          const decryptedStr = await decrypt(cryptoKey, raw.encrypted_payload);
          items = JSON.parse(decryptedStr) as InventoryItem[];
        } catch (e) {
          console.error("Failed to decrypt inventory in saveItem:", e);
        }
      }

      const category = item.category || getInventoryCategory(item.name);
      const isEstimate = item.isEstimate ?? false;
      if (item.id) {
        // Edit
        const idx = items.findIndex(i => i.id === item.id);
        if (idx !== -1) {
          items[idx] = { 
            ...items[idx], 
            name: item.name, 
            amount: item.amount, 
            unit: item.unit,
            category: category,
            isEstimate: isEstimate
          };
        }
      } else {
        // Add
        items.push({
          id: window.crypto.randomUUID(),
          name: item.name,
          amount: item.amount,
          unit: item.unit,
          category: category,
          isEstimate: isEstimate
        });
      }

      if (item.amount > 0) {
        removeIngredientFromDepleted(item.name);
      } else {
        markIngredientAsDepleted(item.name, undefined, item.unit);
      }

      await updateInventoryMutation.mutateAsync(items);
    });
  };

  const addItemsToInventory = async (newItems: (Omit<InventoryItem, "id"> & { category?: string; isEstimate?: boolean })[]) => {
    return navigator.locks.request("inventory-lock", async () => {
      if (!cryptoKey || !userId) throw new Error("Credentials missing");

      const db = await getDb();
      const raw = await db.get("inventory", userId);
      let items: InventoryItem[] = [];
      if (raw) {
        try {
          const decryptedStr = await decrypt(cryptoKey, raw.encrypted_payload);
          items = JSON.parse(decryptedStr) as InventoryItem[];
        } catch (e) {
          console.error("Failed to decrypt inventory in addItemsToInventory:", e);
        }
      }

      for (const newItem of newItems) {
        const category = newItem.category || getInventoryCategory(newItem.name);
        const isEstimate = newItem.isEstimate ?? false;
        const name = newItem.name;
        const amount = newItem.amount;
        const unit = newItem.unit;

        const existingIdx = items.findIndex(
          (i) => i.name.toLowerCase().trim() === name.toLowerCase().trim() && 
                 i.unit.toLowerCase().trim() === unit.toLowerCase().trim()
        );

        if (existingIdx !== -1) {
          items[existingIdx] = {
            ...items[existingIdx],
            amount: items[existingIdx].amount + amount,
            category: category,
            isEstimate: items[existingIdx].isEstimate || isEstimate
          };
        } else {
          items.push({
            id: window.crypto.randomUUID(),
            name,
            amount,
            unit,
            category,
            isEstimate
          });
        }

        if (newItem.amount > 0) {
          removeIngredientFromDepleted(name);
        }
      }

      await updateInventoryMutation.mutateAsync(items);
    });
  };

  const removeItem = async (id: string) => {
    return navigator.locks.request("inventory-lock", async () => {
      if (!cryptoKey || !userId) throw new Error("Credentials missing");

      const db = await getDb();
      const raw = await db.get("inventory", userId);
      let items: InventoryItem[] = [];
      if (raw) {
        try {
          const decryptedStr = await decrypt(cryptoKey, raw.encrypted_payload);
          items = JSON.parse(decryptedStr) as InventoryItem[];
        } catch (e) {
          console.error("Failed to decrypt inventory in removeItem:", e);
        }
      }

      const itemToRemove = items.find(i => i.id === id);
      if (itemToRemove) {
        markIngredientAsDepleted(itemToRemove.name, itemToRemove.amount, itemToRemove.unit);
      }

      const updatedItems = items.filter(i => i.id !== id);
      await updateInventoryMutation.mutateAsync(updatedItems);
    });
  };

  return {
    inventoryItems,
    isLoading: isLoading && !!cryptoKey,
    saveItem,
    addItemsToInventory,
    removeItem,
    updateInventory: updateInventoryMutation.mutateAsync,
    isUpdating: updateInventoryMutation.isPending
  };
}
