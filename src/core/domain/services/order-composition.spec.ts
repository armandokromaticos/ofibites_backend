import { computeDiners, orderLineKind } from "./order-composition";

describe("orderLineKind (T-38)", () => {
  it("es caja si el tamaño tiene servings", () => {
    expect(orderLineKind(1)).toBe("box");
    expect(orderLineKind(8)).toBe("box");
  });

  it("es complemento sin servings, sin tamaño o en combos", () => {
    expect(orderLineKind(null)).toBe("complement");
    expect(orderLineKind(undefined)).toBe("complement");
  });
});

describe("computeDiners (T-38)", () => {
  it("suma servings × quantity solo de las cajas", () => {
    expect(
      computeDiners([
        { servings: 1, quantity: 40 }, // 40 cajas individuales
        { servings: 8, quantity: 2 }, // 2 bandejas de 8 personas
        { servings: null, quantity: 40 }, // jugo: complemento
      ]),
    ).toBe(56);
  });

  it("null si no hay ninguna caja (o no hay líneas)", () => {
    expect(computeDiners([{ servings: null, quantity: 10 }])).toBeNull();
    expect(computeDiners([])).toBeNull();
  });
});
