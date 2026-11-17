import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { PreviewRepeatOrderUseCase } from "./preview-repeat-order.use-case";
import type { IOrderRepository } from "../../../domain/repositories/order.repository.interface";
import type { ICompanyRepository } from "../../../domain/repositories/company.repository.interface";
import type { ICompanyMemberRepository } from "../../../domain/repositories/company-member.repository.interface";
import type { LineItemPricingService } from "../../services/line-item-pricing.service";
import type { LineItemAvailabilityService } from "../../services/line-item-availability.service";
import { OrderEntity } from "../../../domain/entities/order.entity";
import { OrderStatus } from "../../../domain/enums/order-status.enum";
import { OrderPriority } from "../../../domain/enums/order-priority.enum";
import { Role } from "../../../domain/enums/role.enum";
import type { LineAvailabilityCode } from "../../../domain/services/line-availability";

const ORDER_ID = "0f8fad5b-d9cb-469f-a165-70867728950e";

const text = (nameEs: string) => ({
  nameEs,
  nameEn: null,
  descriptionEs: null,
  descriptionEn: null,
});

/** Pedido del Figma: 40 cajas de $22, 10 bandejas de $6 y 40 jugos de $2,44. */
function figmaOrder(
  overrides: {
    companyId?: string;
    userId?: string;
    /** Extra congelado en la línea de cajas (ajuste por caja). */
    boxModifierAdj?: number;
  } = {},
) {
  const line = (
    id: string,
    productId: string,
    quantity: number,
    unitPrice: number,
    servings: number | null,
  ) => ({
    id,
    productId,
    productSizeId: `s-${productId}`,
    comboId: null,
    quantity,
    unitPrice,
    subtotal: unitPrice * quantity,
    modifiers: [],
    catalog: {
      product: { ...text(`Producto ${productId}`), image: null },
      productSize: { ...text(`tamaño ${productId}`), servings },
      combo: null,
    },
  });
  return new OrderEntity({
    id: ORDER_ID,
    userId: overrides.userId ?? "owner-1",
    couponId: null,
    companyId: overrides.companyId ?? "company-1",
    branchId: null,
    departmentId: null,
    createdById: "owner-1",
    deliveryAddressId: "address-1",
    deliveryDate: new Date("2026-09-26T00:00:00.000Z"),
    deliveryTime: "12:30",
    notes: null,
    priority: OrderPriority.MEDIUM,
    status: OrderStatus.DELIVERED,
    subtotal: 1037.6,
    discount: 0,
    tax: 166.02,
    shipping: 0,
    taxRate: 0.16,
    total: 1203.62,
    orderNumber: "OF-2026-0001",
    receiverName: "Yelitza Ramos",
    receiverPhone: "+58 212 555 3311",
    addressDetail: "Piso 8",
    addressReference: "Frente a la plaza",
    createdAt: new Date("2026-09-24T13:15:00.000Z"),
    updatedAt: new Date(),
    items: [
      overrides.boxModifierAdj === undefined
        ? line("oi-box", "box", 40, 22, 1)
        : {
            ...line("oi-box", "box", 40, 22, 1),
            subtotal: (22 + overrides.boxModifierAdj) * 40,
            modifiers: [
              {
                id: "oim-1",
                modifierId: "m-extra",
                priceAdjustment: overrides.boxModifierAdj,
              },
            ],
          },
      line("oi-tray", "tray", 10, 6, null),
      line("oi-juice", "juice", 40, 2.44, null),
    ],
  });
}

function setup(
  options: {
    found?: OrderEntity | null;
    member?: boolean;
    /** productId → precio unitario de hoy */
    currentPrices?: Record<string, number>;
    availabilityCodes?: Record<string, LineAvailabilityCode>;
    /** modifierId → ajuste de hoy */
    currentModifierAdj?: Record<string, number>;
  } = {},
) {
  const found = options.found === undefined ? figmaOrder() : options.found;
  const orderRepository = {
    findUnique: jest.fn(() => Promise.resolve(found)),
  };
  const companyRepository = {
    findUnique: jest.fn(() => Promise.resolve({ isActive: true })),
  };
  const companyMemberRepository = {
    findActiveByUserAndCompany: jest.fn(() =>
      Promise.resolve(options.member === false ? null : { id: "member-1" }),
    ),
  };
  const priceOf = (productId: string) =>
    options.currentPrices?.[productId] ??
    { box: 22, tray: 6, juice: 2.44 }[productId] ??
    1;
  type Input = {
    productId: string;
    quantity: number;
    modifiers?: { modifierId: string }[];
  };
  const priced = (input: Input) => {
    const modifiers = (input.modifiers ?? []).map((m) => ({
      modifierId: m.modifierId,
      priceAdjustment: options.currentModifierAdj?.[m.modifierId] ?? 0,
    }));
    const unit =
      priceOf(input.productId) +
      modifiers.reduce((sum, m) => sum + m.priceAdjustment, 0);
    return {
      unitPrice: priceOf(input.productId),
      subtotal: Math.round(unit * input.quantity * 100) / 100,
      modifiers,
    };
  };
  const pricing = {
    priceLineItem: jest.fn((input: Input) => Promise.resolve(priced(input))),
    priceLines: jest.fn((inputs: Input[]) =>
      Promise.resolve(inputs.map(priced)),
    ),
  };
  const availability = {
    check: jest.fn((input: { productId: string }) => {
      const code = options.availabilityCodes?.[input.productId];
      return Promise.resolve(code ? { code, message: "x" } : null);
    }),
  };
  const useCase = new PreviewRepeatOrderUseCase(
    orderRepository as unknown as IOrderRepository,
    companyRepository as unknown as ICompanyRepository,
    companyMemberRepository as unknown as ICompanyMemberRepository,
    pricing as unknown as LineItemPricingService,
    availability as unknown as LineItemAvailabilityService,
  );
  return { useCase, pricing };
}

const buyer = { id: "buyer-1", role: Role.CLIENT };

describe("PreviewRepeatOrderUseCase (T-38)", () => {
  it("sin cambios de precio: todas las líneas, comensales y resumen del servidor", async () => {
    const { useCase } = setup();
    const result = await useCase.execute("company-1", buyer, ORDER_ID);

    expect(result.lines.map((l) => [l.orderItemId, l.kind])).toEqual([
      ["oi-box", "box"],
      ["oi-tray", "complement"],
      ["oi-juice", "complement"],
    ]);
    expect(result.diners).toBe(40);
    expect(result.priceChangedCount).toBe(0);
    // 880 + 60 + 97,60 = 1.037,60; IVA 16 % = 166,02; sin envío (≥ 150).
    expect(result.summary).toMatchObject({
      subtotal: 1037.6,
      tax: 166.02,
      shipping: 0,
      total: 1203.62,
    });
    expect(result.order).toMatchObject({
      id: ORDER_ID,
      orderNumber: "OF-2026-0001",
      deliveryAddressId: "address-1",
      receiverName: "Yelitza Ramos",
      addressDetail: "Piso 8",
      addressReference: "Frente a la plaza",
      diners: 40,
      total: 1203.62,
    });
  });

  it("precio que subió: chip con el precio del pedido y conteo", async () => {
    const { useCase } = setup({ currentPrices: { box: 23.5 } });
    const result = await useCase.execute("company-1", buyer, ORDER_ID);
    expect(result.lines[0]).toMatchObject({
      orderUnitPrice: 22,
      currentUnitPrice: 23.5,
      priceChanged: true,
      subtotal: 940,
    });
    expect(result.lines[1].priceChanged).toBe(false);
    expect(result.priceChangedCount).toBe(1);
    expect(result.summary.subtotal).toBe(1097.6);
  });

  it("un extra que sube de precio cuenta como cambio (precio efectivo con modificadores)", async () => {
    const { useCase } = setup({
      found: figmaOrder({ boxModifierAdj: 2 }),
      currentModifierAdj: { "m-extra": 3 },
    });
    const result = await useCase.execute("company-1", buyer, ORDER_ID);
    expect(result.lines[0]).toMatchObject({
      orderUnitPrice: 24, // 22 + 2 congelados
      currentUnitPrice: 25, // 22 + 3 de hoy
      priceChanged: true,
      subtotal: 1000, // = currentUnitPrice × quantity
    });
    expect(result.priceChangedCount).toBe(1);
  });

  it("con el mismo extra al mismo precio no hay cambio", async () => {
    const { useCase } = setup({
      found: figmaOrder({ boxModifierAdj: 2 }),
      currentModifierAdj: { "m-extra": 2 },
    });
    const result = await useCase.execute("company-1", buyer, ORDER_ID);
    expect(result.lines[0]).toMatchObject({
      orderUnitPrice: 24,
      currentUnitPrice: 24,
      priceChanged: false,
      subtotal: 960,
    });
    expect(result.priceChangedCount).toBe(0);
  });

  it("línea no disponible: motivo, sin precio actual y fuera del resumen", async () => {
    const { useCase } = setup({ availabilityCodes: { juice: "UNAVAILABLE" } });
    const result = await useCase.execute("company-1", buyer, ORDER_ID);
    expect(result.lines[2]).toMatchObject({
      isAvailable: false,
      unavailableCode: "UNAVAILABLE",
      unavailableReason: "Ya no está disponible",
      currentUnitPrice: null,
      subtotal: null,
      priceChanged: false,
    });
    expect(result.summary.subtotal).toBe(940);
  });

  it("ninguna disponible → 200 con todo a 0 (no es error)", async () => {
    const { useCase, pricing } = setup({
      availabilityCodes: {
        box: "NOT_FOUND",
        tray: "CONFIGURATION",
        juice: "UNAVAILABLE",
      },
    });
    const result = await useCase.execute("company-1", buyer, ORDER_ID);
    expect(result.lines.every((l) => !l.isAvailable)).toBe(true);
    expect(result.summary.total).toBe(0);
    expect(result.diners).toBeNull();
    expect(pricing.priceLines).not.toHaveBeenCalled();
  });

  it("con lo editado: cantidades nuevas y la quitada con included = false", async () => {
    const { useCase } = setup();
    const result = await useCase.execute("company-1", buyer, ORDER_ID, [
      { orderItemId: "oi-box", quantity: 50 },
      { orderItemId: "oi-juice", quantity: 50 },
    ]);
    expect(result.lines[0]).toMatchObject({
      included: true,
      orderQuantity: 40,
      quantity: 50,
      subtotal: 1100,
    });
    expect(result.lines[1]).toMatchObject({
      included: false,
      quantity: 0,
      subtotal: null,
      currentUnitPrice: 6, // se informa igual
    });
    expect(result.diners).toBe(50);
    expect(result.summary.subtotal).toBe(1222);
  });

  it("selección con una línea ajena → 400 REPEAT_ITEM_NOT_IN_ORDER", async () => {
    const { useCase } = setup();
    await expect(
      useCase.execute("company-1", buyer, ORDER_ID, [
        { orderItemId: "otra", quantity: 1 },
      ]),
    ).rejects.toMatchObject({
      response: { code: "REPEAT_ITEM_NOT_IN_ORDER" },
    });
  });

  it("pedido de otra empresa → 404; sin acceso → 403", async () => {
    await expect(
      setup({ found: figmaOrder({ companyId: "otra" }) }).useCase.execute(
        "company-1",
        buyer,
        ORDER_ID,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      setup({ member: false }).useCase.execute("company-1", buyer, ORDER_ID),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("OPERATOR no ve el total del pedido original", async () => {
    const { useCase } = setup();
    const result = await useCase.execute(
      "company-1",
      { id: "op-1", role: Role.OPERATOR },
      ORDER_ID,
    );
    expect(result.order.total).toBeNull();
  });
});
