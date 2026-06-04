export interface DepletedIngredient {
  name: string;
  amount: number;
  unit: string;
}

export function markIngredientAsDepleted(name: string, amount?: number, unit?: string) {
  try {
    const listStr = localStorage.getItem("omninom_depleted_ingredients") || "[]";
    let list: any[] = JSON.parse(listStr);
    const cleanName = name.trim().toLowerCase();
    if (!cleanName) return;

    // Remove any existing entries for this ingredient
    list = list.filter(item => {
      const itemName = typeof item === "string" ? item : item.name;
      return itemName.trim().toLowerCase() !== cleanName;
    });

    list.push({
      name: name.trim(),
      amount: amount !== undefined && amount > 0 ? amount : 1,
      unit: unit || "Stück"
    });

    localStorage.setItem("omninom_depleted_ingredients", JSON.stringify(list));
  } catch (e) {
    console.error("Failed to mark ingredient as depleted", e);
  }
}

export function removeIngredientFromDepleted(name: string) {
  try {
    const listStr = localStorage.getItem("omninom_depleted_ingredients") || "[]";
    const list: any[] = JSON.parse(listStr);
    const cleanName = name.trim().toLowerCase();
    
    const filtered = list.filter(item => {
      const itemName = typeof item === "string" ? item : item.name;
      return itemName.trim().toLowerCase() !== cleanName;
    });
    
    localStorage.setItem("omninom_depleted_ingredients", JSON.stringify(filtered));
  } catch (e) {
    console.error("Failed to remove ingredient from depleted list", e);
  }
}

export function getDepletedIngredients(): (string | DepletedIngredient)[] {
  try {
    const listStr = localStorage.getItem("omninom_depleted_ingredients") || "[]";
    return JSON.parse(listStr);
  } catch (e) {
    console.error("Failed to read depleted list", e);
    return [];
  }
}
