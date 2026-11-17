import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { OrderInvoiceResponseDto } from "../invoices/invoice-response.dto";
import { OrderPriority } from "../../../domain/enums/order-priority.enum";
import { OrderStatusGroup } from "../../../domain/services/order-status-groups";
import { OrderStatus } from "../../../domain/enums/order-status.enum";
import { ORDER_LINE_KINDS } from "../../../domain/services/order-composition";
import type { OrderLineKind } from "../../../domain/services/order-composition";

export class OrderItemModifierResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  modifierId: string;

  @ApiProperty({
    nullable: true,
    type: Number,
    description: "Oculto para roles sin acceso a precios",
  })
  priceAdjustment: number | null;

  @ApiProperty({ description: "Nombre del modificador en lang (T-38)" })
  name: string;
}

export class OrderPersonRefDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;
}

export class OrderStatusHistoryEntryDto {
  @ApiProperty({ enum: OrderStatus })
  status: OrderStatus;

  @ApiProperty({ enum: OrderStatusGroup })
  statusGroup: OrderStatusGroup;

  @ApiProperty({
    description: "Momento del cambio (ISO). Mostrar en hora de Caracas.",
  })
  at: Date;

  @ApiProperty({
    description:
      "true = fecha reconstruida en la migración (updated_at), no registrada en el momento",
  })
  estimated: boolean;
}

export class OrderItemResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  productId: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  productSizeId: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  comboId: string | null;

  @ApiProperty()
  quantity: number;

  @ApiProperty({
    nullable: true,
    type: Number,
    description: "Oculto para roles sin acceso a precios",
  })
  unitPrice: number | null;

  @ApiProperty({
    nullable: true,
    type: Number,
    description: "Oculto para roles sin acceso a precios",
  })
  subtotal: number | null;

  @ApiProperty({
    enum: ORDER_LINE_KINDS,
    description:
      'T-38: "box" si el tamaño elegido tiene servings; si no, "complement" (también combos y líneas sin tamaño)',
  })
  kind: OrderLineKind;

  @ApiProperty({ description: "Nombre del combo o del producto, en lang" })
  name: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  image: string | null;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: "Nombre del tamaño en lang",
  })
  sizeLabel: string | null;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: "Descripción del tamaño en lang",
  })
  sizeDescription: string | null;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: "Descripción del producto o del combo en lang",
  })
  description: string | null;

  @ApiPropertyOptional({
    nullable: true,
    type: Number,
    description: "Personas que rinde el tamaño elegido",
  })
  servings: number | null;

  @ApiPropertyOptional({ type: () => [OrderItemModifierResponseDto] })
  modifiers?: OrderItemModifierResponseDto[];
}

export class OrderResponseDto {
  @ApiProperty()
  id: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  userId: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  couponId: string | null;

  @ApiProperty()
  companyId: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  branchId: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  departmentId: string | null;

  @ApiProperty()
  createdById: string;

  @ApiProperty()
  deliveryAddressId: string;

  @ApiPropertyOptional({ nullable: true, type: Date })
  deliveryDate: Date | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  deliveryTime: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  notes: string | null;

  @ApiProperty({ enum: OrderPriority })
  priority: OrderPriority;

  @ApiProperty()
  status: string;

  @ApiProperty({
    enum: OrderStatusGroup,
    description:
      'Grupo visible para "Pedidos realizados" del cliente. Calculado a partir de `status`, no es una columna de BD.',
  })
  statusGroup: OrderStatusGroup;

  @ApiProperty({
    nullable: true,
    type: Number,
    description: "Oculto para roles sin acceso a precios",
  })
  subtotal: number | null;

  @ApiProperty({
    nullable: true,
    type: Number,
    description: "Oculto para roles sin acceso a precios",
  })
  discount: number | null;

  @ApiProperty({
    nullable: true,
    type: Number,
    description:
      "IVA congelado al crear el pedido (0 en pedidos anteriores al checkout). Oculto para roles sin acceso a precios",
  })
  tax: number | null;

  @ApiProperty({
    nullable: true,
    type: Number,
    description:
      "Envío congelado al crear el pedido (0 en pedidos anteriores al checkout). Oculto para roles sin acceso a precios",
  })
  shipping: number | null;

  @ApiProperty({
    nullable: true,
    type: Number,
    example: 0.16,
    description:
      "T-38: tasa de IVA congelada al crear el pedido (0 sin IVA). Oculto para roles sin acceso a precios",
  })
  taxRate: number | null;

  @ApiProperty({
    nullable: true,
    type: Number,
    description:
      "subtotal − discount + tax + shipping. Oculto para roles sin acceso a precios",
  })
  total: number | null;

  @ApiProperty({
    nullable: true,
    type: Number,
    description:
      "T-38: comensales calculados (Σ servings × quantity de las cajas). null si no hay cajas",
  })
  diners: number | null;

  @ApiProperty({
    type: () => OrderPersonRefDto,
    nullable: true,
    description: "T-38: quien hizo el pedido (user o, si falta, createdBy)",
  })
  user: OrderPersonRefDto | null;

  @ApiProperty({ type: () => OrderPersonRefDto, nullable: true })
  department: OrderPersonRefDto | null;

  @ApiPropertyOptional({
    type: () => [OrderStatusHistoryEntryDto],
    description: "T-38: solo en GET /orders/:id, en orden cronológico",
  })
  statusHistory?: OrderStatusHistoryEntryDto[];

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    example: "OF-2026-0042",
    description: "Número legible, secuencial por año de Caracas",
  })
  orderNumber: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  receiverName: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  receiverPhone: string | null;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: "Piso / oficina",
  })
  addressDetail: string | null;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: "Punto de referencia",
  })
  addressReference: string | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiPropertyOptional({ type: () => [OrderItemResponseDto] })
  items?: OrderItemResponseDto[];

  @ApiProperty({
    type: () => OrderInvoiceResponseDto,
    nullable: true,
    description:
      "Factura del pedido (T-06). null si aún no se confirmó, si no tiene factura o para OPERATOR",
  })
  invoice: OrderInvoiceResponseDto | null;
}

/**
 * Forma de `GET /orders` cuando se pide paginación (`skip` y/o `take`). Sin
 * ellos, el endpoint sigue devolviendo el array plano de `OrderResponseDto[]`
 * (no rompe a los consumidores actuales, p. ej. el dashboard).
 */
export class PaginatedOrderResponseDto {
  @ApiProperty({ type: () => [OrderResponseDto] })
  data: OrderResponseDto[];

  @ApiProperty({ description: "Total de órdenes que cumple el filtro." })
  total: number;
}
