import { 
  Milk, 
  Egg, 
  Apple, 
  Banana, 
  Carrot, 
  Wheat, 
  Coffee, 
  Croissant, 
  Beef, 
  Fish, 
  Soup, 
  Utensils
} from "lucide-react";

export interface FrequentIngredient {
  id: string;
  name: string;
  defaultAmount: number;
  defaultUnit: string;
  category: string;
  iconName: string;
}

export const FREQUENT_INGREDIENTS: FrequentIngredient[] = [
  { id: "milch", name: "Milch", defaultAmount: 1, defaultUnit: "l", category: "Milchprodukte", iconName: "milk" },
  { id: "eier", name: "Eier", defaultAmount: 10, defaultUnit: "Stück", category: "Milchprodukte", iconName: "egg" },
  { id: "butter", name: "Butter", defaultAmount: 250, defaultUnit: "g", category: "Milchprodukte", iconName: "utensils" },
  { id: "kaese", name: "Käse", defaultAmount: 200, defaultUnit: "g", category: "Milchprodukte", iconName: "utensils" },
  { id: "brot", name: "Brot", defaultAmount: 1, defaultUnit: "Stück", category: "Backwaren", iconName: "croissant" },
  { id: "aepfel", name: "Äpfel", defaultAmount: 1, defaultUnit: "kg", category: "Gemüse & Obst", iconName: "apple" },
  { id: "bananen", name: "Bananen", defaultAmount: 1, defaultUnit: "kg", category: "Gemüse & Obst", iconName: "banana" },
  { id: "karotten", name: "Karotten", defaultAmount: 500, defaultUnit: "g", category: "Gemüse & Obst", iconName: "carrot" },
  { id: "tomaten", name: "Tomaten", defaultAmount: 500, defaultUnit: "g", category: "Gemüse & Obst", iconName: "apple" },
  { id: "zwiebeln", name: "Zwiebeln", defaultAmount: 500, defaultUnit: "g", category: "Gemüse & Obst", iconName: "carrot" },
  { id: "nudeln", name: "Nudeln", defaultAmount: 500, defaultUnit: "g", category: "Sonstiges", iconName: "wheat" },
  { id: "kaffee", name: "Kaffee", defaultAmount: 500, defaultUnit: "g", category: "Sonstiges", iconName: "coffee" }
];

export function getIngredientIcon(iconName: string) {
  switch (iconName) {
    case "milk": return Milk;
    case "egg": return Egg;
    case "croissant": return Croissant;
    case "apple": return Apple;
    case "banana": return Banana;
    case "carrot": return Carrot;
    case "wheat": return Wheat;
    case "coffee": return Coffee;
    case "beef": return Beef;
    case "fish": return Fish;
    case "soup": return Soup;
    case "utensils":
    default:
      return Utensils;
  }
}

export function getIconForIngredient(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("milch") || n.includes("sahne") || n.includes("joghurt") || n.includes("quark") || n.includes("käse") || n.includes("butter")) {
    return "milk";
  }
  if (n.includes("ei") || n.includes("eier")) {
    return "egg";
  }
  if (n.includes("apfel") || n.includes("äpfel") || n.includes("birne") || n.includes("tomate") || n.includes("pfirsich") || n.includes("frucht") || n.includes("obst")) {
    return "apple";
  }
  if (n.includes("banan")) {
    return "banana";
  }
  if (n.includes("karotte") || n.includes("möhre") || n.includes("rübe") || n.includes("zwiebel") || n.includes("knoblauch") || n.includes("lauch")) {
    return "carrot";
  }
  if (n.includes("nudel") || n.includes("pasta") || n.includes("mehl") || n.includes("reis") || n.includes("getreide") || n.includes("hafer")) {
    return "wheat";
  }
  if (n.includes("kaffee") || n.includes("espresso") || n.includes("tee")) {
    return "coffee";
  }
  if (n.includes("brot") || n.includes("brötchen") || n.includes("croissant") || n.includes("baguette") || n.includes("toast") || n.includes("teig")) {
    return "croissant";
  }
  if (n.includes("fleisch") || n.includes("rind") || n.includes("hähnchen") || n.includes("schwein") || n.includes("steak") || n.includes("hack")) {
    return "beef";
  }
  if (n.includes("fisch") || n.includes("lachs") || n.includes("thunfisch") || n.includes("garnele") || n.includes("meeresfrucht")) {
    return "fish";
  }
  if (n.includes("suppe") || n.includes("eintopf") || n.includes("brühe") || n.includes("sauce") || n.includes("soße")) {
    return "soup";
  }
  return "utensils";
}
