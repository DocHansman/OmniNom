import { useState, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../App";
import { 
  getSyncQueue, 
  clearSyncQueueItems, 
  getDb
} from "../db/localDb";
import { apiFetch, getServerUrl } from "../api/apiClient";

export interface ConflictState {
  mine: any;
  theirs: any;
  entityType: "recipe" | "meal_plan" | "inventory" | "shopping_list";
}

export function useSync() {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [conflict, setConflict] = useState<ConflictState | null>(null);

  // Helper: Convert Local DB record to Sync API Item format
  const mapRecordToSyncItem = async (id: string, type: string) => {
    const db = await getDb();
    
    switch (type) {
      case "recipe": {
        const recipe = await db.get("recipes", id);
        if (!recipe) return null;
        return {
          id: recipe.id,
          entity_type: "recipe",
          encrypted_payload: recipe.encrypted_payload,
          photo_path: recipe.photo_path,
          dietary_tags: recipe.dietary_tags,
          rating: recipe.rating,
          updated_at: recipe.updated_at,
          is_deleted: recipe.is_deleted
        };
      }
      case "meal_plan": {
        const item = await db.get("mealPlan", id);
        // If not found in IndexedDB, it was hard deleted, so we send it as deleted
        if (!item) {
          return {
            id,
            entity_type: "meal_plan",
            updated_at: new Date().toISOString(),
            is_deleted: true
          };
        }
        return {
          id: item.id,
          entity_type: "meal_plan",
          recipe_id: item.recipe_id,
          week_date: item.week_date,
          servings: item.servings,
          updated_at: item.updated_at,
          is_deleted: false
        };
      }
      case "inventory": {
        const item = await db.get("inventory", id);
        if (!item) {
          return {
            id,
            entity_type: "inventory",
            updated_at: new Date().toISOString(),
            is_deleted: true
          };
        }
        return {
          id: item.id,
          entity_type: "inventory",
          encrypted_payload: item.encrypted_payload,
          updated_at: item.updated_at,
          is_deleted: false
        };
      }
      case "shopping_list": {
        const item = await db.get("shoppingList", id);
        if (!item) {
          return {
            id,
            entity_type: "shopping_list",
            updated_at: new Date().toISOString(),
            is_deleted: true
          };
        }
        return {
          id: item.id,
          entity_type: "shopping_list",
          encrypted_payload: item.encrypted_payload,
          is_checked: item.is_checked,
          updated_at: item.updated_at,
          is_deleted: false
        };
      }
      default:
        return null;
    }
  };

  // 1. PUSH: Send local queue updates to server
  const pushSync = useCallback(async (): Promise<boolean> => {
    if (!isAuthenticated) return false;
    const queue = await getSyncQueue();
    if (queue.length === 0) return true;

    console.log(`Pushing ${queue.length} offline changes to server...`);
    const syncItems = [];
    const itemIds = [];
    
    for (const qItem of queue) {
      const apiItem = await mapRecordToSyncItem(qItem.id, qItem.entity_type);
      if (apiItem) {
        syncItems.push(apiItem);
        itemIds.push(qItem.id);
      }
    }

    try {
      const response = await apiFetch("/api/sync", {
        method: "POST",
        body: JSON.stringify(syncItems)
      });

      if (response.ok) {
        // Sync successful, remove items from queue
        await clearSyncQueueItems(itemIds);
        console.log("Push sync completed successfully.");
        return true;
      } 
      
      if (response.status === 409) {
        // Collision conflict detected!
        const data = await response.json();
        const serverConflict = data.conflicts[0]; // Resolve one by one
        
        const localVersion = syncItems.find(i => i.id === serverConflict.id);
        
        setConflict({
          mine: localVersion,
          theirs: serverConflict,
          entityType: serverConflict.entity_type
        });
        
        console.warn("Sync collision conflict detected!");
      }
      return false;
    } catch (e) {
      console.warn("Push sync failed (offline or network error).", e);
      return false;
    }
  }, [isAuthenticated]);

  // 2. PULL: Fetch all server states and integrate locally
  const pullSync = useCallback(async () => {
    if (!isAuthenticated) return;
    
    try {
      console.log("Pulling updates from server...");
      const response = await apiFetch("/api/sync");
      if (!response.ok) return;

      const data = await response.json();
      const db = await getDb();
      const tx = db.transaction(["recipes", "mealPlan", "inventory", "shoppingList"], "readwrite");
      
      // Integrate Recipes
      for (const sRecipe of data.recipes) {
        const local = await tx.objectStore("recipes").get(sRecipe.id);
        if (!local || new Date(sRecipe.updated_at) > new Date(local.updated_at)) {
          await tx.objectStore("recipes").put({
            id: sRecipe.id,
            encrypted_payload: sRecipe.encrypted_payload,
            photo_path: sRecipe.photo_path,
            dietary_tags: sRecipe.dietary_tags,
            rating: sRecipe.rating,
            updated_at: sRecipe.updated_at,
            is_deleted: sRecipe.is_deleted
          });
        }
      }

      // Integrate Meal Plan
      for (const sItem of data.meal_plan) {
        const local = await tx.objectStore("mealPlan").get(sItem.id);
        if (!local || new Date(sItem.updated_at) > new Date(local.updated_at)) {
          await tx.objectStore("mealPlan").put({
            id: sItem.id,
            recipe_id: sItem.recipe_id,
            week_date: sItem.week_date,
            servings: sItem.servings,
            updated_at: sItem.updated_at
          });
        }
      }

      // Integrate Inventory
      for (const sItem of data.inventory) {
        const local = await tx.objectStore("inventory").get(sItem.id);
        if (!local || new Date(sItem.updated_at) > new Date(local.updated_at)) {
          await tx.objectStore("inventory").put({
            id: sItem.id,
            encrypted_payload: sItem.encrypted_payload,
            updated_at: sItem.updated_at
          });
        }
      }

      // Integrate Shopping List
      for (const sItem of data.shopping_list) {
        const local = await tx.objectStore("shoppingList").get(sItem.id);
        if (!local || new Date(sItem.updated_at) > new Date(local.updated_at)) {
          await tx.objectStore("shoppingList").put({
            id: sItem.id,
            encrypted_payload: sItem.encrypted_payload,
            is_checked: sItem.is_checked,
            updated_at: sItem.updated_at
          });
        }
      }

      await tx.done;
      console.log("Pull sync completed successfully.");
      
      // Invalidate TanStack query cache to force UI re-render
      queryClient.invalidateQueries();
    } catch (e) {
      console.warn("Pull sync failed.", e);
    }
  }, [isAuthenticated, queryClient]);

  // 3. Orcherstrate Full Two-Way Sync
  const triggerSync = useCallback(async () => {
    if (isSyncing || !isAuthenticated) return;
    setIsSyncing(true);
    
    try {
      const pushed = await pushSync();
      if (pushed) {
        await pullSync();
      }
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing, isAuthenticated, pushSync, pullSync]);

  // 4. Conflict Resolution Helper
  const resolveConflict = async (choice: "mine" | "theirs") => {
    if (!conflict) return;
    const { mine, theirs, entityType } = conflict;
    const db = await getDb();
    
    if (choice === "mine") {
      // Overwrite server by generating a brand new timestamp, pushing this record back into sync queue
      const forceUpdatedAt = new Date().toISOString();
      const updatedRecord = { ...mine, updated_at: forceUpdatedAt };
      
      // Save locally & queue
      const tx = db.transaction([getStoreName(entityType), "syncQueue"], "readwrite");
      await tx.objectStore(getStoreName(entityType) as any).put(updatedRecord);
      await tx.objectStore("syncQueue").put({
        id: mine.id,
        entity_type: entityType,
        updated_at: forceUpdatedAt
      });
      await tx.done;
    } else {
      // Accept Server version. Overwrite local record and clear queue item
      const tx = db.transaction([getStoreName(entityType), "syncQueue"], "readwrite");
      if (theirs.is_deleted) {
        await tx.objectStore(getStoreName(entityType) as any).delete(theirs.id);
      } else {
        await tx.objectStore(getStoreName(entityType) as any).put(theirs);
      }
      await tx.objectStore("syncQueue").delete(theirs.id);
      await tx.done;
    }
    
    // Clear conflict state and re-trigger sync
    setConflict(null);
    queryClient.invalidateQueries();
    setTimeout(() => triggerSync(), 200);
  };

  // Helper to map entity type to IndexedDB store name
  const getStoreName = (type: string): "recipes" | "mealPlan" | "inventory" | "shoppingList" => {
    switch (type) {
      case "recipe": return "recipes";
      case "meal_plan": return "mealPlan";
      case "inventory": return "inventory";
      case "shopping_list": return "shoppingList";
      default: throw new Error(`Unknown entity type: ${type}`);
    }
  };

  // Set up WebSocket listeners for live updates
  useEffect(() => {
    if (!isAuthenticated) return;

    let ws: WebSocket | null = null;
    let reconnectTimeout: any = null;
    let reconnectDelay = 1000; // start with 1s delay

    const connectWebSocket = () => {
      const serverUrl = getServerUrl();
      const wsProtocol = serverUrl.startsWith("https") ? "wss" : "ws";
      const wsUrl = `${wsProtocol}://${serverUrl.replace(/^https?:\/\//, "")}/ws/sync`;
      
      console.log(`Connecting WebSocket to: ${wsUrl}`);
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log("WebSocket Sync Connection active.");
        reconnectDelay = 1000; // Reset exponential backoff
        // Run initial sync on connect
        triggerSync();
      };

      ws.onmessage = (event) => {
        try {
          if (event.data === "acknowledged") return;
          const msg = JSON.parse(event.data);
          console.log("Received remote sync trigger:", msg);
          
          // Trigger pull to fetch the remote changes
          pullSync();
        } catch (err) {
          console.error("Failed to parse WebSocket message", err);
        }
      };

      ws.onclose = (event) => {
        console.log(`WebSocket closed (code: ${event.code}). Attempting reconnect...`);
        cleanup();
        
        // Exponential backoff reconnect
        reconnectTimeout = setTimeout(() => {
          reconnectDelay = Math.min(reconnectDelay * 2, 30000); // Max 30s
          connectWebSocket();
        }, reconnectDelay);
      };

      ws.onerror = (err) => {
        console.error("WebSocket error:", err);
        ws?.close();
      };
    };

    const cleanup = () => {
      if (ws) {
        ws.onopen = null;
        ws.onmessage = null;
        ws.onclose = null;
        ws.onerror = null;
        ws.close();
        ws = null;
      }
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
    };

    connectWebSocket();

    // Listen for custom trigger events from other hooks
    const handleSyncTrigger = () => {
      triggerSync();
    };
    window.addEventListener("trigger-background-sync", handleSyncTrigger);

    return () => {
      cleanup();
      window.removeEventListener("trigger-background-sync", handleSyncTrigger);
    };
  }, [isAuthenticated, triggerSync, pullSync]);

  return {
    isSyncing,
    conflict,
    resolveConflict,
    triggerSync
  };
}
