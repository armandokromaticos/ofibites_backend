import { Prisma } from "@prisma/client";
import { OrderEntity } from "./order.entity";
import { OrderStatusGroup } from "../services/order-status-groups";
import { Lang } from "../enums/lang.enum";

const dec = (n: number) => new Prisma.Decimal(n);

const BASE = {
  id: "order-1",
  userId: "user-1",
  couponId: null,
  companyId: "company-1",
  branchId: null,
  departmentId: null,
  createdById: "user-1",
  deliveryAddressId: "address-1",
  deliveryDate: null,
  deliveryTime: null,
  notes: null,
  priority: "MEDIUM" as const,
  status: "CREATED" as const,
  subtotal: dec(100),
  discount: dec(0),
  total: dec(121),
  createdAt: new Date(),
  updatedAt: new Date(),
};

function persisted(): OrderEntity {
  return OrderEntity.fromPrisma({
    ...BASE,
    tax: dec(16),
    shipping: dec(5),
    orderNumber: "OF-2026-0001",
    receiverName: "Ana",
    receiverPhone: "04125551234",
    addressDetail: null,
    addressReference: null,
    items: [],
  });
}

describe("OrderEntity.toResponseDto", () => {
  it("expone tax, shipping, orderNumber, el receptor y statusGroup", () => {
    expect(persisted().toResponseDto()).toMatchObject({
      tax: 16,
      shipping: 5,
      total: 121,
      orderNumber: "OF-2026-0001",
      receiverName: "Ana",
      statusGroup: OrderStatusGroup.RECEIVED, // CREATED
    });
  });

  it("maskPrices (OPERATOR) oculta también tax y shipping", () => {
    const dto = persisted().toResponseDto({ maskPrices: true });
    expect(dto).toMatchObject({
      subtotal: null,
      discount: null,
      tax: null,
      shipping: null,
      total: null,
    });
    // Lo que no es precio se sigue viendo.
    expect(dto.orderNumber).toBe("OF-2026-0001");
    expect(dto.receiverName).toBe("Ana");
  });

  it("fila sin columnas del checkout → tax/shipping 0 y el resto null", () => {
    const dto = OrderEntity.fromPrisma(BASE).toResponseDto();
    expect(dto).toMatchObject({
      tax: 0,
      shipping: 0,
      orderNumber: null,
      receiverName: null,
      addressReference: null,
    });
  });
});

describe("OrderEntity: detalle del pedido (T-38)", () => {
  const text = (nameEs: string, nameEn: string | null = null) => ({
    nameEs,
    nameEn,
    descriptionEs: null as string | null,
    descriptionEn: null as string | null,
  });

  type ItemRow = NonNullable<
    Parameters<typeof OrderEntity.fromPrisma>[0]["items"]
  >[number];
  const item = (
    overrides: Partial<ItemRow> &
      Pick<ItemRow, "id" | "productId" | "quantity">,
  ): ItemRow => ({
    orderId: "order-1",
    productSizeId: null,
    comboId: null,
    unitPrice: dec(1),
    subtotal: dec(1),
    modifiers: [],
    productSize: null,
    combo: null,
    ...overrides,
  });

  function detailed(): OrderEntity {
    return OrderEntity.fromPrisma({
      ...BASE,
      status: "DELIVERED" as const,
      taxRate: dec(0.16),
      user: null,
      createdBy: { id: "user-9", name: "María Gabriela Pérez" },
      department: { id: "dep-1", name: "Recursos Humanos" },
      statusHistory: [
        {
          toStatus: "CREATED" as const,
          changedAt: new Date("2026-09-24T13:15:00.000Z"),
          estimated: false,
        },
        {
          toStatus: "DELIVERED" as const,
          changedAt: new Date("2026-09-26T16:24:00.000Z"),
          estimated: true,
        },
      ],
      items: [
        item({
          id: "oi-box",
          productId: "p-box",
          productSizeId: "s-box",
          quantity: 40,
          unitPrice: dec(22),
          subtotal: dec(880),
          product: {
            ...text("Coffee Break Clásico", "Classic Coffee Break"),
            descriptionEs: "Tequeños de queso, pastelito criollo",
            image: "https://img/box.png",
          },
          productSize: {
            ...text("caja individual", "single box"),
            servings: 1,
          },
          modifiers: [
            {
              id: "oim-1",
              orderItemId: "oi-box",
              modifierId: "m-1",
              priceAdjustment: dec(0),
              modifier: { nameEs: "Sin azúcar", nameEn: "Sugar free" },
            },
          ],
        }),
        item({
          id: "oi-tray",
          productId: "p-tray",
          productSizeId: "s-tray",
          quantity: 10,
          product: { ...text("Mini pastelitos surtidos"), image: null },
          productSize: {
            ...text("bandeja de 10"),
            descriptionEs: "Bandeja para compartir · 10 piezas",
            servings: null,
          },
        }),
        item({
          id: "oi-combo",
          productId: "p-any",
          comboId: "c-1",
          quantity: 2,
          product: { ...text("Producto del combo"), image: null },
          combo: { ...text("Combo oficina"), image: "https://img/combo.png" },
        }),
      ],
    });
  }

  it("clasifica las líneas, calcula comensales y expone tamaño y descripciones", () => {
    const dto = detailed().toResponseDto();
    expect(dto.diners).toBe(40);
    expect(dto.taxRate).toBe(0.16);
    expect(dto.items?.map((i) => [i.kind, i.name])).toEqual([
      ["box", "Coffee Break Clásico"],
      ["complement", "Mini pastelitos surtidos"],
      ["complement", "Combo oficina"], // combo = complemento
    ]);
    expect(dto.items?.[0]).toMatchObject({
      sizeLabel: "caja individual",
      sizeDescription: null,
      description: "Tequeños de queso, pastelito criollo",
      servings: 1,
      image: "https://img/box.png",
    });
    expect(dto.items?.[0].modifiers?.[0].name).toBe("Sin azúcar");
    expect(dto.items?.[1]).toMatchObject({
      sizeDescription: "Bandeja para compartir · 10 piezas",
      servings: null,
    });
    expect(dto.items?.[2].image).toBe("https://img/combo.png");
  });

  it("user cae a createdBy si no hay userId, y trae el departamento", () => {
    const dto = detailed().toResponseDto();
    expect(dto.user).toEqual({ id: "user-9", name: "María Gabriela Pérez" });
    expect(dto.department).toEqual({ id: "dep-1", name: "Recursos Humanos" });
  });

  it("statusHistory con su grupo y la marca de estimada", () => {
    expect(detailed().toResponseDto().statusHistory).toEqual([
      {
        status: "CREATED",
        statusGroup: OrderStatusGroup.RECEIVED,
        at: new Date("2026-09-24T13:15:00.000Z"),
        estimated: false,
      },
      {
        status: "DELIVERED",
        statusGroup: OrderStatusGroup.DELIVERED,
        at: new Date("2026-09-26T16:24:00.000Z"),
        estimated: true,
      },
    ]);
  });

  it("sin el include de detalle no hay statusHistory", () => {
    expect(persisted().toResponseDto().statusHistory).toBeUndefined();
  });

  it("lang=en traduce nombres y cae a ES si falta", () => {
    const dto = detailed().toResponseDto({ lang: Lang.EN });
    expect(dto.items?.[0].name).toBe("Classic Coffee Break");
    expect(dto.items?.[0].sizeLabel).toBe("single box");
    expect(dto.items?.[0].modifiers?.[0].name).toBe("Sugar free");
    expect(dto.items?.[1].name).toBe("Mini pastelitos surtidos");
  });

  it("maskPrices (OPERATOR) oculta taxRate pero no comensales ni usuario", () => {
    const dto = detailed().toResponseDto({ maskPrices: true });
    expect(dto.taxRate).toBeNull();
    expect(dto.diners).toBe(40);
    expect(dto.user?.name).toBe("María Gabriela Pérez");
  });

  it("pedidos sin cajas → diners null; fila sin tax_rate → 0", () => {
    const dto = persisted().toResponseDto();
    expect(dto.diners).toBeNull();
    expect(dto.taxRate).toBe(0);
    expect(dto.user).toBeNull();
  });

  it("toPrismaCreate guarda taxRate y la primera fila del historial", () => {
    const entity = OrderEntity.fromCreateDto({
      userId: "user-1",
      companyId: "company-1",
      createdById: "user-1",
      deliveryAddressId: "address-1",
      subtotal: 100,
      discount: 0,
      tax: 16,
      taxRate: 0.16,
      total: 116,
      items: [],
    });
    const data = entity.toPrismaCreate("OF-2026-0001");
    expect(Number(data.taxRate)).toBe(0.16);
    expect(data.statusHistory).toEqual({
      create: {
        fromStatus: null,
        toStatus: "CREATED",
        changedBy: { connect: { id: "user-1" } },
      },
    });
  });
});
