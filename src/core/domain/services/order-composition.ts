/**
 * Composición de un pedido en cajas y complementos (T-38, decisión del usuario
 * 2026-11-17): una línea es **caja** si el tamaño elegido rinde para un número
 * de personas (`ProductSize.servings` no nulo); todo lo demás (bebidas,
 * bandejas, café, combos, líneas sin tamaño) es **complemento**. Los
 * comensales no se guardan: se calculan con las cajas.
 */
export type OrderLineKind = "box" | "complement";

export const ORDER_LINE_KINDS: readonly OrderLineKind[] = ["box", "complement"];

/** Clasifica una línea por los `servings` de su tamaño (null/undefined = complemento). */
export function orderLineKind(
  servings: number | null | undefined,
): OrderLineKind {
  return typeof servings === "number" ? "box" : "complement";
}

/**
 * Comensales: Σ servings × quantity de las líneas que son caja. `null` si no
 * hay ninguna caja (el front pinta "—").
 */
export function computeDiners(
  lines: readonly { servings: number | null | undefined; quantity: number }[],
): number | null {
  let diners = 0;
  let hasBox = false;
  for (const line of lines) {
    if (orderLineKind(line.servings) !== "box") continue;
    hasBox = true;
    diners += (line.servings as number) * line.quantity;
  }
  return hasBox ? diners : null;
}
