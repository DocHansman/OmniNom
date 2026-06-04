import { openDB, DBSchema, IDBPDatabase } from "idb";

export interface RecipeLocal {
  id: string;
  encrypted_payload: string;
  photo_path: string | null;
  dietary_tags: string[];
  rating: number | null;
  updated_at: string;
  is_deleted: boolean;
}

export interface MealPlanLocal {
  id: string;
  recipe_id: string | null;
  week_date: string;
  servings: number;
  updated_at: string;
}

export interface InventoryLocal {
  id: string;
  encrypted_payload: string;
  updated_at: string;
}

export interface ShoppingListLocal {
  id: string;
  encrypted_payload: string;
  is_checked: boolean;
  updated_at: string;
}

export interface SyncQueueItem {
  id: string; // Record UUID
  entity_type: "recipe" | "meal_plan" | "inventory" | "shopping_list";
  updated_at: string;
}

interface OmniNomDB extends DBSchema {
  recipes: {
    key: string;
    value: RecipeLocal;
  };
  mealPlan: {
    key: string;
    value: MealPlanLocal;
  };
  inventory: {
    key: string;
    value: InventoryLocal;
  };
  shoppingList: {
    key: string;
    value: ShoppingListLocal;
  };
  syncQueue: {
    key: string;
    value: SyncQueueItem;
  };
}

const DATABASE_NAME = "omninom_local_db";
const DATABASE_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<OmniNomDB>> | null = null;

export function getDb(): Promise<IDBPDatabase<OmniNomDB>> {
  if (!dbPromise) {
    dbPromise = openDB<OmniNomDB>(DATABASE_NAME, DATABASE_VERSION, {
      upgrade(db) {
        db.createObjectStore("recipes", { keyPath: "id" });
        db.createObjectStore("mealPlan", { keyPath: "id" });
        db.createObjectStore("inventory", { keyPath: "id" });
        db.createObjectStore("shoppingList", { keyPath: "id" });
        db.createObjectStore("syncQueue", { keyPath: "id" });
      },
    });
  }
  return dbPromise;
}

// ----------------------------------------------------
// DATABASE OPERATION WRAPPERS
// ----------------------------------------------------

export async function clearAllStores(): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(["recipes", "mealPlan", "inventory", "shoppingList", "syncQueue"], "readwrite");
  await Promise.all([
    tx.objectStore("recipes").clear(),
    tx.objectStore("mealPlan").clear(),
    tx.objectStore("inventory").clear(),
    tx.objectStore("shoppingList").clear(),
    tx.objectStore("syncQueue").clear(),
  ]);
  await tx.done;
}

// Recipes
export async function getLocalRecipe(id: string): Promise<RecipeLocal | undefined> {
  const db = await getDb();
  return db.get("recipes", id);
}

export async function getAllLocalRecipes(): Promise<RecipeLocal[]> {
  const db = await getDb();
  const recipes = await db.getAll("recipes");
  return recipes.filter((r) => !r.is_deleted);
}

export async function putLocalRecipe(recipe: RecipeLocal, addToQueue: boolean = true): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(["recipes", "syncQueue"], "readwrite");
  await tx.objectStore("recipes").put(recipe);
  if (addToQueue) {
    await tx.objectStore("syncQueue").put({
      id: recipe.id,
      entity_type: "recipe",
      updated_at: recipe.updated_at,
    });
  }
  await tx.done;
}

// Meal Plan
export async function getLocalMealPlan(): Promise<MealPlanLocal[]> {
  const db = await getDb();
  return db.getAll("mealPlan");
}

export async function putLocalMealPlanItem(item: MealPlanLocal, addToQueue: boolean = true): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(["mealPlan", "syncQueue"], "readwrite");
  await tx.objectStore("mealPlan").put(item);
  if (addToQueue) {
    await tx.objectStore("syncQueue").put({
      id: item.id,
      entity_type: "meal_plan",
      updated_at: item.updated_at,
    });
  }
  await tx.done;
}

export async function deleteLocalMealPlanItem(id: string, addToQueue: boolean = true): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(["mealPlan", "syncQueue"], "readwrite");
  await tx.objectStore("mealPlan").delete(id);
  if (addToQueue) {
    await tx.objectStore("syncQueue").put({
      id: id,
      entity_type: "meal_plan",
      updated_at: new Date().toISOString(), // Use current time to signal deletion
    });
  }
  await tx.done;
}

// Inventory
export async function getLocalInventory(): Promise<InventoryLocal[]> {
  const db = await getDb();
  return db.getAll("inventory");
}

export async function putLocalInventoryItem(item: InventoryLocal, addToQueue: boolean = true): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(["inventory", "syncQueue"], "readwrite");
  await tx.objectStore("inventory").put(item);
  if (addToQueue) {
    await tx.objectStore("syncQueue").put({
      id: item.id,
      entity_type: "inventory",
      updated_at: item.updated_at,
    });
  }
  await tx.done;
}

export async function deleteLocalInventoryItem(id: string, addToQueue: boolean = true): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(["inventory", "syncQueue"], "readwrite");
  await tx.objectStore("inventory").delete(id);
  if (addToQueue) {
    await tx.objectStore("syncQueue").put({
      id: id,
      entity_type: "inventory",
      updated_at: new Date().toISOString(),
    });
  }
  await tx.done;
}

// Shopping List
export async function getLocalShoppingList(): Promise<ShoppingListLocal[]> {
  const db = await getDb();
  return db.getAll("shoppingList");
}

export async function putLocalShoppingListItem(item: ShoppingListLocal, addToQueue: boolean = true): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(["shoppingList", "syncQueue"], "readwrite");
  await tx.objectStore("shoppingList").put(item);
  if (addToQueue) {
    await tx.objectStore("syncQueue").put({
      id: item.id,
      entity_type: "shopping_list",
      updated_at: item.updated_at,
    });
  }
  await tx.done;
}

export async function deleteLocalShoppingListItem(id: string, addToQueue: boolean = true): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(["shoppingList", "syncQueue"], "readwrite");
  await tx.objectStore("shoppingList").delete(id);
  if (addToQueue) {
    await tx.objectStore("syncQueue").put({
      id: id,
      entity_type: "shopping_list",
      updated_at: new Date().toISOString(),
    });
  }
  await tx.done;
}

// Sync Queue helpers
export async function getSyncQueue(): Promise<SyncQueueItem[]> {
  const db = await getDb();
  return db.getAll("syncQueue");
}

export async function clearSyncQueueItems(ids: string[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction("syncQueue", "readwrite");
  await Promise.all(ids.map((id) => tx.objectStore("syncQueue").delete(id)));
  await tx.done;
}
