export const INVENTORY_CATEGORIES = [
  "Kühlschrank",
  "Konserven",
  "Trocken",
  "Gewürze",
  "Frische Kräuter",
  "Tiefkühl",
  "Sonstiges"
];

export const SHOPPING_CATEGORIES = [
  "Gemüse & Obst",
  "Milchprodukte",
  "Fleisch & Fisch",
  "Tiefkühl",
  "Backwaren",
  "Getränke",
  "Sonstiges"
];

export function getInventoryCategory(ingredientName: string): string {
  const name = ingredientName.toLowerCase().trim();
  if (
    name.includes("milch") || name.includes("käse") || name.includes("quark") || 
    name.includes("sahne") || name.includes("butter") || name.includes("joghurt") ||
    name.includes("schmand") || name.includes("wurst") || name.includes("fleisch") ||
    name.includes("hähnchen") || name.includes("rind") || name.includes("schinken") ||
    name.includes("lachs") || name.includes("feta") || name.includes("mozzarella") ||
    name.includes("hefe") || name.includes("ei ") || name.endsWith("eier") || name === "eier" ||
    name.includes("creme")
  ) {
    return "Kühlschrank";
  }
  if (
    name.includes("tomate") || name.includes("bohne") || name.includes("mais") ||
    name.includes("erbsen") || name.includes("thunfisch") || name.includes("brühe") ||
    name.includes("kichererbse") || name.includes("dose") || name.includes("konserve") ||
    name.includes("pesto") || name.includes("senf") || name.includes("ketchup")
  ) {
    return "Konserven";
  }
  if (
    name.includes("nudeln") || name.includes("reis") || name.includes("mehl") ||
    name.includes("zucker") || name.includes("haferflocken") || name.includes("grieß") ||
    name.includes("kaffee") || name.includes("tee") || name.includes("linsen") ||
    name.includes("brot") || name.includes("brötchen") || name.includes("nudel") ||
    name.includes("pasta") || name.includes("müsli") || name.includes("backpulver")
  ) {
    return "Trocken";
  }
  if (
    name.includes("salz") || name.includes("pfeffer") || name.includes("paprikapulver") ||
    name.includes("zimt") || name.includes("oregano") || name.includes("gewürz") ||
    name.includes("curry") || name.includes("knoblauchpulver") || name.includes("zwiebelpulver") ||
    name.includes("muskat") || name.includes("chili") || name.includes("vanille")
  ) {
    return "Gewürze";
  }
  if (
    name.includes("basilikum") || name.includes("petersilie") || name.includes("dill") ||
    name.includes("schnittlauch") || name.includes("minze") || name.includes("kräuter") ||
    name.includes("koriander") || name.includes("thymian") || name.includes("rosmarin")
  ) {
    return "Frische Kräuter";
  }
  if (
    name.includes("tk") || name.includes("tiefkühl") || name.includes("pommes") ||
    name.includes("eis") || name.includes("pizza") || name.includes("beeren")
  ) {
    return "Tiefkühl";
  }
  return "Sonstiges";
}

export function getShoppingCategory(ingredientName: string): string {
  const name = ingredientName.toLowerCase().trim();
  if (
    name.includes("apfel") || name.includes("banane") || name.includes("kartoffel") || 
    name.includes("tomate") || name.includes("zwiebel") || name.includes("salat") || 
    name.includes("gemüse") || name.includes("obst") || name.includes("knoblauch") || 
    name.includes("zitron") || name.includes("gurke") || name.includes("möhre") || 
    name.includes("karotte") || name.includes("kräuter") || name.includes("pilze") ||
    name.includes("avocado") || name.includes("paprika") || name.includes("ingwer")
  ) {
    return "Gemüse & Obst";
  }
  if (
    name.includes("milch") || name.includes("käse") || name.includes("quark") || 
    name.includes("sahne") || name.includes("butter") || name.includes("joghurt") || 
    name.includes("parmesan") || name.includes("feta") || name.includes("mozzarella") ||
    name.includes("mascarpone") || name.includes("creme") || name.includes("schmand")
  ) {
    return "Milchprodukte";
  }
  if (
    name.includes("fleisch") || name.includes("hähnchen") || name.includes("rind") || 
    name.includes("schwein") || name.includes("schinken") || name.includes("wurst") || 
    name.includes("fisch") || name.includes("lachs") || name.includes("garnele") ||
    name.includes("speck") || name.includes("hackfleisch") || name.includes("hühnchen")
  ) {
    return "Fleisch & Fisch";
  }
  if (name.includes("eis") || name.includes("pizza") || name.includes("tk") || name.includes("tiefkühl") || name.includes("pommes")) {
    return "Tiefkühl";
  }
  if (
    name.includes("brot") || name.includes("brötchen") || name.includes("baguette") || 
    name.includes("hefe") || name.includes("toast") || name.includes("croissant")
  ) {
    return "Backwaren";
  }
  if (
    name.includes("wasser") || name.includes("saft") || name.includes("bier") || 
    name.includes("wein") || name.includes("limo") || name.includes("cola") || 
    name.includes("limonade") || name.includes("soda")
  ) {
    return "Getränke";
  }
  return "Sonstiges";
}
