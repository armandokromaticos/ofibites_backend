import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { isUUID } from "class-validator";
import { Role } from "../../../core/domain/enums/role.enum";
import { CompanyRole } from "../../../core/domain/enums/company-role.enum";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { PlatformOrCompanyRoleGuard } from "../../auth/guards/platform-or-company-role.guard";
import { PlatformOrCompanyRole } from "../../auth/decorators/platform-or-company-role.decorator";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import { AddCartItemDto } from "../../../core/application/dto/cart/add-cart-item.dto";
import { UpdateCartItemDto } from "../../../core/application/dto/cart/update-cart-item.dto";
import { CartResponseDto } from "../../../core/application/dto/cart/cart-response.dto";
import { GetCartUseCase } from "../../../core/application/use-cases/cart/get-cart.use-case";
import { AddCartItemUseCase } from "../../../core/application/use-cases/cart/add-cart-item.use-case";
import { UpdateCartItemUseCase } from "../../../core/application/use-cases/cart/update-cart-item.use-case";
import { RemoveCartItemUseCase } from "../../../core/application/use-cases/cart/remove-cart-item.use-case";
import { ClearCartUseCase } from "../../../core/application/use-cases/cart/clear-cart.use-case";
import { RepeatOrderIntoCartUseCase } from "../../../core/application/use-cases/cart/repeat-order-into-cart.use-case";
import { CartLangQueryDto } from "../../../core/application/dto/cart/cart-lang-query.dto";
import { RepeatOrderIntoCartResponseDto } from "../../../core/application/dto/cart/repeat-order-into-cart-response.dto";
import { ApplyCartCouponDto } from "../../../core/application/dto/cart/apply-cart-coupon.dto";
import { ApplyCartCouponUseCase } from "../../../core/application/use-cases/cart/apply-cart-coupon.use-case";
import { RemoveCartCouponUseCase } from "../../../core/application/use-cases/cart/remove-cart-coupon.use-case";
import { PreviewRepeatOrderUseCase } from "../../../core/application/use-cases/cart/preview-repeat-order.use-case";
import { RepeatOrderIntoCartDto } from "../../../core/application/dto/cart/repeat-order-into-cart.dto";
import { RepeatPreviewResponseDto } from "../../../core/application/dto/cart/repeat-preview-response.dto";

const orderIdPipe = new ParseUUIDPipe({
  exceptionFactory: () =>
    new BadRequestException("orderId debe ser un UUID válido"),
});

const CART_ACCESS = {
  platformRoles: [Role.SUPER_ADMIN, Role.OPS_ADMIN],
  companyRoles: [CompanyRole.COMPANY_ADMIN, CompanyRole.COMPANY_BUYER],
};

@ApiTags("Cart")
@ApiBearerAuth()
@ApiHeader({
  name: "X-Company-Id",
  required: true,
  description:
    "Empresa activa. Cada usuario tiene su propio carrito dentro de cada empresa (T-35).",
})
@Controller("cart")
@UseGuards(JwtAuthGuard, PlatformOrCompanyRoleGuard)
export class CartController {
  constructor(
    private readonly getCartUseCase: GetCartUseCase,
    private readonly addCartItemUseCase: AddCartItemUseCase,
    private readonly updateCartItemUseCase: UpdateCartItemUseCase,
    private readonly removeCartItemUseCase: RemoveCartItemUseCase,
    private readonly clearCartUseCase: ClearCartUseCase,
    private readonly repeatOrderIntoCartUseCase: RepeatOrderIntoCartUseCase,
    private readonly applyCartCouponUseCase: ApplyCartCouponUseCase,
    private readonly removeCartCouponUseCase: RemoveCartCouponUseCase,
    private readonly previewRepeatOrderUseCase: PreviewRepeatOrderUseCase,
  ) {}

  @Get()
  @PlatformOrCompanyRole(CART_ACCESS)
  @ApiOperation({
    summary: "Obtener mi carrito en la empresa (con precios vigentes)",
  })
  async getCart(
    @Query() query: CartLangQueryDto,
    @CurrentUser() user: { id: string },
    @Headers("x-company-id") companyIdHeader?: string,
  ): Promise<CartResponseDto> {
    const companyId = this.requireCompanyId(companyIdHeader);
    return this.getCartUseCase.execute(companyId, user.id, query.lang);
  }

  @Post("items")
  @HttpCode(200)
  @PlatformOrCompanyRole(CART_ACCESS)
  @ApiOperation({
    summary:
      "Agregar línea al carrito. Si ya existe una idéntica (producto + tamaño/combo + mismos modificadores) incrementa la cantidad.",
  })
  async addItem(
    @Body() dto: AddCartItemDto,
    @Query() query: CartLangQueryDto,
    @CurrentUser() user: { id: string },
    @Headers("x-company-id") companyIdHeader?: string,
  ): Promise<CartResponseDto> {
    const companyId = this.requireCompanyId(companyIdHeader);
    return this.addCartItemUseCase.execute(companyId, user.id, dto, query.lang);
  }

  @Patch("items/:id")
  @HttpCode(200)
  @PlatformOrCompanyRole(CART_ACCESS)
  @ApiOperation({ summary: "Cambiar la cantidad de una línea del carrito" })
  async updateItem(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateCartItemDto,
    @Query() query: CartLangQueryDto,
    @CurrentUser() user: { id: string },
    @Headers("x-company-id") companyIdHeader?: string,
  ): Promise<CartResponseDto> {
    const companyId = this.requireCompanyId(companyIdHeader);
    return this.updateCartItemUseCase.execute(
      companyId,
      user.id,
      id,
      dto,
      query.lang,
    );
  }

  @Delete("items/:id")
  @HttpCode(200)
  @PlatformOrCompanyRole(CART_ACCESS)
  @ApiOperation({ summary: "Quitar una línea del carrito" })
  async removeItem(
    @Param("id", ParseUUIDPipe) id: string,
    @Query() query: CartLangQueryDto,
    @CurrentUser() user: { id: string },
    @Headers("x-company-id") companyIdHeader?: string,
  ): Promise<CartResponseDto> {
    const companyId = this.requireCompanyId(companyIdHeader);
    return this.removeCartItemUseCase.execute(
      companyId,
      user.id,
      id,
      query.lang,
    );
  }

  @Delete()
  @HttpCode(200)
  @PlatformOrCompanyRole(CART_ACCESS)
  @ApiOperation({
    summary: "Vaciar mi carrito en la empresa (también quita el cupón)",
  })
  async clear(
    @Query() query: CartLangQueryDto,
    @CurrentUser() user: { id: string },
    @Headers("x-company-id") companyIdHeader?: string,
  ): Promise<CartResponseDto> {
    const companyId = this.requireCompanyId(companyIdHeader);
    return this.clearCartUseCase.execute(companyId, user.id, query.lang);
  }

  @Post("coupon")
  @HttpCode(200)
  @PlatformOrCompanyRole(CART_ACCESS)
  @ApiOperation({
    summary:
      "Aplicar un código promocional al carrito (reemplaza al anterior). El descuento se recalcula en cada lectura y en el checkout.",
  })
  @ApiOkResponse({ type: CartResponseDto })
  @ApiResponse({
    status: 400,
    description:
      "Código inexistente, no vigente, de otra empresa, ya usado por el usuario o carrito vacío (message en español para el usuario)",
  })
  async applyCoupon(
    @Body() dto: ApplyCartCouponDto,
    @Query() query: CartLangQueryDto,
    @CurrentUser() user: { id: string },
    @Headers("x-company-id") companyIdHeader?: string,
  ): Promise<CartResponseDto> {
    const companyId = this.requireCompanyId(companyIdHeader);
    return this.applyCartCouponUseCase.execute(
      companyId,
      user.id,
      dto,
      query.lang,
    );
  }

  @Delete("coupon")
  @HttpCode(200)
  @PlatformOrCompanyRole(CART_ACCESS)
  @ApiOperation({
    summary: "Quitar el código promocional del carrito (idempotente)",
  })
  @ApiOkResponse({ type: CartResponseDto })
  async removeCoupon(
    @Query() query: CartLangQueryDto,
    @CurrentUser() user: { id: string },
    @Headers("x-company-id") companyIdHeader?: string,
  ): Promise<CartResponseDto> {
    const companyId = this.requireCompanyId(companyIdHeader);
    return this.removeCartCouponUseCase.execute(companyId, user.id, query.lang);
  }

  // Antes que "repeat/:orderId" para que "last" no llegue al pipe de UUID.
  @Post("repeat/last")
  @HttpCode(200)
  @PlatformOrCompanyRole(CART_ACCESS)
  @ApiOperation({
    summary:
      "Copiar al carrito las líneas disponibles de mi último pedido en la empresa (sin CANCELLED/REJECTED). No crea pedido.",
  })
  @ApiOkResponse({ type: RepeatOrderIntoCartResponseDto })
  @ApiResponse({
    status: 400,
    description: "Ninguna línea del pedido sigue disponible",
  })
  @ApiResponse({ status: 404, description: "Sin pedidos para repetir" })
  async repeatLastOrder(
    @Query() query: CartLangQueryDto,
    @CurrentUser() user: { id: string; role: Role },
    @Headers("x-company-id") companyIdHeader?: string,
  ): Promise<RepeatOrderIntoCartResponseDto> {
    const companyId = this.requireCompanyId(companyIdHeader);
    return this.repeatOrderIntoCartUseCase.execute(
      companyId,
      { id: user.id, role: user.role },
      { last: true },
      query.lang,
    );
  }

  // Antes que "repeat/:orderId" (rutas distintas, pero así se lee igual que /last).
  @Post("repeat/:orderId/preview")
  @HttpCode(200)
  @PlatformOrCompanyRole(CART_ACCESS)
  @ApiOperation({
    summary:
      "Vista previa de repetir un pedido (T-38): disponibilidad, precio del pedido vs. actual y resumen con las cantidades elegidas. No escribe nada.",
  })
  @ApiParam({ name: "orderId", format: "uuid" })
  @ApiBody({ type: RepeatOrderIntoCartDto, required: false })
  @ApiOkResponse({ type: RepeatPreviewResponseDto })
  @ApiResponse({
    status: 400,
    description:
      "Body inválido (REPEAT_ITEM_DUPLICATED, REPEAT_ITEM_NOT_IN_ORDER, lista vacía)",
  })
  @ApiResponse({ status: 403, description: "Sin acceso al pedido" })
  @ApiResponse({
    status: 404,
    description: "El pedido no existe o es de otra empresa",
  })
  async previewRepeatOrder(
    @Param("orderId", orderIdPipe) orderId: string,
    @Body() dto: RepeatOrderIntoCartDto,
    @Query() query: CartLangQueryDto,
    @CurrentUser() user: { id: string; role: Role },
    @Headers("x-company-id") companyIdHeader?: string,
  ): Promise<RepeatPreviewResponseDto> {
    const companyId = this.requireCompanyId(companyIdHeader);
    return this.previewRepeatOrderUseCase.execute(
      companyId,
      { id: user.id, role: user.role },
      orderId,
      dto?.items,
      query.lang,
    );
  }

  @Post("repeat/:orderId")
  @HttpCode(200)
  @PlatformOrCompanyRole(CART_ACCESS)
  @ApiOperation({
    summary:
      "Copiar al carrito (en una transacción) las líneas disponibles de un pedido de la empresa. Con body { items }, solo esas líneas y cantidades (T-38). No crea pedido.",
  })
  @ApiBody({ type: RepeatOrderIntoCartDto, required: false })
  @ApiParam({ name: "orderId", format: "uuid" })
  @ApiOkResponse({ type: RepeatOrderIntoCartResponseDto })
  @ApiResponse({
    status: 400,
    description: "Ninguna línea del pedido sigue disponible",
  })
  @ApiResponse({ status: 403, description: "Sin acceso al pedido" })
  @ApiResponse({
    status: 404,
    description: "El pedido no existe o es de otra empresa",
  })
  async repeatOrder(
    @Param("orderId", orderIdPipe) orderId: string,
    @Body() dto: RepeatOrderIntoCartDto,
    @Query() query: CartLangQueryDto,
    @CurrentUser() user: { id: string; role: Role },
    @Headers("x-company-id") companyIdHeader?: string,
  ): Promise<RepeatOrderIntoCartResponseDto> {
    const companyId = this.requireCompanyId(companyIdHeader);
    return this.repeatOrderIntoCartUseCase.execute(
      companyId,
      { id: user.id, role: user.role },
      dto?.items ? { orderId, items: dto.items } : { orderId },
      query.lang,
    );
  }

  private requireCompanyId(value: string | undefined): string {
    const trimmed = value?.trim();
    if (!trimmed) {
      throw new BadRequestException("X-Company-Id es requerido");
    }
    if (!isUUID(trimmed, "4")) {
      throw new BadRequestException("X-Company-Id debe ser un UUID válido");
    }
    return trimmed;
  }
}
