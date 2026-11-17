import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import type { App } from "supertest/types";
import { CartController } from "./cart.controller";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { PlatformOrCompanyRoleGuard } from "../../auth/guards/platform-or-company-role.guard";
import { GetCartUseCase } from "../../../core/application/use-cases/cart/get-cart.use-case";
import { AddCartItemUseCase } from "../../../core/application/use-cases/cart/add-cart-item.use-case";
import { UpdateCartItemUseCase } from "../../../core/application/use-cases/cart/update-cart-item.use-case";
import { RemoveCartItemUseCase } from "../../../core/application/use-cases/cart/remove-cart-item.use-case";
import { ClearCartUseCase } from "../../../core/application/use-cases/cart/clear-cart.use-case";
import { RepeatOrderIntoCartUseCase } from "../../../core/application/use-cases/cart/repeat-order-into-cart.use-case";
import { ApplyCartCouponUseCase } from "../../../core/application/use-cases/cart/apply-cart-coupon.use-case";
import { RemoveCartCouponUseCase } from "../../../core/application/use-cases/cart/remove-cart-coupon.use-case";
import { PreviewRepeatOrderUseCase } from "../../../core/application/use-cases/cart/preview-repeat-order.use-case";

const COMPANY_ID = "0f8fad5b-d9cb-469f-a165-70867728950e";

// Rutas, pipes y validación reales; guards y use-cases sustituidos.
describe("CartController (HTTP)", () => {
  let app: INestApplication<App>;
  const getCart = { execute: jest.fn(() => Promise.resolve({ items: [] })) };
  const repeat = {
    execute: jest.fn(() =>
      Promise.resolve({ cart: { items: [] }, added: 1, skipped: [] }),
    ),
  };
  const preview = {
    execute: jest.fn(() => Promise.resolve({ lines: [], diners: null })),
  };
  const applyCoupon = {
    execute: jest.fn(() => Promise.resolve({ items: [], coupon: null })),
  };
  const removeCoupon = {
    execute: jest.fn(() => Promise.resolve({ items: [], coupon: null })),
  };
  const passGuard = {
    canActivate: (ctx: {
      switchToHttp: () => { getRequest: () => Record<string, unknown> };
    }) => {
      ctx.switchToHttp().getRequest().user = { id: "user-1", role: "CLIENT" };
      return true;
    },
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [CartController],
      providers: [
        { provide: GetCartUseCase, useValue: getCart },
        { provide: AddCartItemUseCase, useValue: {} },
        { provide: UpdateCartItemUseCase, useValue: {} },
        { provide: RemoveCartItemUseCase, useValue: {} },
        { provide: ClearCartUseCase, useValue: {} },
        { provide: RepeatOrderIntoCartUseCase, useValue: repeat },
        { provide: ApplyCartCouponUseCase, useValue: applyCoupon },
        { provide: RemoveCartCouponUseCase, useValue: removeCoupon },
        { provide: PreviewRepeatOrderUseCase, useValue: preview },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(passGuard)
      .overrideGuard(PlatformOrCompanyRoleGuard)
      .useValue(passGuard)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => jest.clearAllMocks());

  it("POST /cart/repeat/last no pasa por el pipe de UUID", async () => {
    await request(app.getHttpServer())
      .post("/cart/repeat/last")
      .set("X-Company-Id", COMPANY_ID)
      .expect(200);
    expect(repeat.execute).toHaveBeenCalledWith(
      COMPANY_ID,
      { id: "user-1", role: "CLIENT" },
      { last: true },
      undefined,
    );
  });

  it("POST /cart/repeat/:orderId con un id no UUID → 400 en español", async () => {
    const res = await request(app.getHttpServer())
      .post("/cart/repeat/no-es-uuid")
      .set("X-Company-Id", COMPANY_ID)
      .expect(400);
    expect((res.body as { message: unknown }).message).toBe(
      "orderId debe ser un UUID válido",
    );
    expect(repeat.execute).not.toHaveBeenCalled();
  });

  it("POST /cart/repeat/:orderId pasa el id y el idioma", async () => {
    await request(app.getHttpServer())
      .post(`/cart/repeat/${COMPANY_ID}?lang=en`)
      .set("X-Company-Id", COMPANY_ID)
      .expect(200);
    expect(repeat.execute).toHaveBeenCalledWith(
      COMPANY_ID,
      { id: "user-1", role: "CLIENT" },
      { orderId: COMPANY_ID },
      "en",
    );
  });

  // T-38: body opcional con lo editado y vista previa.
  const ITEM_ID = "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed";

  it("POST /cart/repeat/:orderId con items los pasa al use-case", async () => {
    await request(app.getHttpServer())
      .post(`/cart/repeat/${COMPANY_ID}`)
      .set("X-Company-Id", COMPANY_ID)
      .send({ items: [{ orderItemId: ITEM_ID, quantity: 12 }] })
      .expect(200);
    expect(repeat.execute).toHaveBeenCalledWith(
      COMPANY_ID,
      { id: "user-1", role: "CLIENT" },
      { orderId: COMPANY_ID, items: [{ orderItemId: ITEM_ID, quantity: 12 }] },
      undefined,
    );
  });

  it.each([
    [{ items: [] }, "Elige al menos un producto para repetir"],
    [
      { items: [{ orderItemId: "no-uuid", quantity: 1 }] },
      "items.0.orderItemId debe ser un UUID válido",
    ],
    [
      { items: [{ orderItemId: ITEM_ID, quantity: 0 }] },
      "items.0.quantity debe ser al menos 1",
    ],
    [
      { items: [{ orderItemId: ITEM_ID, quantity: 1000 }] },
      "items.0.quantity no puede ser mayor que 999",
    ],
  ])(
    "POST /cart/repeat/:orderId con body inválido → 400 (%j)",
    async (body, message) => {
      const res = await request(app.getHttpServer())
        .post(`/cart/repeat/${COMPANY_ID}`)
        .set("X-Company-Id", COMPANY_ID)
        .send(body)
        .expect(400);
      expect((res.body as { message: string[] }).message).toContain(message);
      expect(repeat.execute).not.toHaveBeenCalled();
    },
  );

  it("POST /cart/repeat/:orderId/preview sin body → todas las líneas", async () => {
    await request(app.getHttpServer())
      .post(`/cart/repeat/${COMPANY_ID}/preview?lang=en`)
      .set("X-Company-Id", COMPANY_ID)
      .expect(200);
    expect(preview.execute).toHaveBeenCalledWith(
      COMPANY_ID,
      { id: "user-1", role: "CLIENT" },
      COMPANY_ID,
      undefined,
      "en",
    );
    expect(repeat.execute).not.toHaveBeenCalled();
  });

  it("POST /cart/repeat/:orderId/preview con un id no UUID → 400", async () => {
    await request(app.getHttpServer())
      .post("/cart/repeat/no-es-uuid/preview")
      .set("X-Company-Id", COMPANY_ID)
      .expect(400);
    expect(preview.execute).not.toHaveBeenCalled();
  });

  it("GET /cart?lang=fr → 400", async () => {
    const res = await request(app.getHttpServer())
      .get("/cart?lang=fr")
      .set("X-Company-Id", COMPANY_ID)
      .expect(400);
    expect((res.body as { message: unknown }).message).toEqual([
      "lang solo admite: es, en",
    ]);
    expect(getCart.execute).not.toHaveBeenCalled();
  });

  it("GET /cart?lang=en pasa el idioma al use-case", async () => {
    await request(app.getHttpServer())
      .get("/cart?lang=en")
      .set("X-Company-Id", COMPANY_ID)
      .expect(200);
    expect(getCart.execute).toHaveBeenCalledWith(COMPANY_ID, "user-1", "en");
  });

  it("POST /cart/coupon recorta el código y pasa usuario y empresa", async () => {
    await request(app.getHttpServer())
      .post("/cart/coupon")
      .set("X-Company-Id", COMPANY_ID)
      .send({ code: "  verano10 " })
      .expect(200);
    expect(applyCoupon.execute).toHaveBeenCalledWith(
      COMPANY_ID,
      "user-1",
      { code: "verano10" },
      undefined,
    );
  });

  it("POST /cart/coupon sin código → 400 sin llamar al use-case", async () => {
    applyCoupon.execute.mockClear();
    const res = await request(app.getHttpServer())
      .post("/cart/coupon")
      .set("X-Company-Id", COMPANY_ID)
      .send({ code: "   " })
      .expect(400);
    expect((res.body as { message: unknown }).message).toEqual([
      "Escribe un código",
    ]);
    expect(applyCoupon.execute).not.toHaveBeenCalled();
  });

  it("DELETE /cart/coupon → 200", async () => {
    await request(app.getHttpServer())
      .delete("/cart/coupon")
      .set("X-Company-Id", COMPANY_ID)
      .expect(200);
    expect(removeCoupon.execute).toHaveBeenCalledWith(
      COMPANY_ID,
      "user-1",
      undefined,
    );
  });
});
