import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ORDER_LINE_KINDS } from "../../../domain/services/order-composition";
import type { OrderLineKind } from "../../../domain/services/order-composition";
import type { LineAvailabilityCode } from "../../../domain/services/line-availability";
import { CartSummaryResponseDto } from "./cart-response.dto";

export class RepeatPreviewOrderDto {
  @ApiProperty()
  id: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  orderNumber: string | null;

  @ApiProperty()
  createdAt: Date;

  @ApiPropertyOptional({ nullable: true, type: Date })
  deliveryDate: Date | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  deliveryTime: string | null;

  @ApiProperty()
  deliveryAddressId: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  receiverName: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  receiverPhone: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  addressDetail: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  addressReference: string | null;

  @ApiProperty({
    nullable: true,
    type: Number,
    description: "Comensales del pedido original",
  })
  diners: number | null;

  @ApiProperty({
    nullable: true,
    type: Number,
    description: "Total congelado del pedido original. null para OPERATOR",
  })
  total: number | null;
}

export class RepeatPreviewLineDto {
  @ApiProperty()
  orderItemId: string;

  @ApiProperty()
  productId: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  productSizeId: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  comboId: string | null;

  @ApiProperty({ enum: ORDER_LINE_KINDS })
  kind: OrderLineKind;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  image: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  sizeLabel: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  sizeDescription: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  description: string | null;

  @ApiPropertyOptional({ nullable: true, type: Number })
  servings: number | null;

  @ApiProperty({
    description: "false si el body trae items y no incluye esta línea",
  })
  included: boolean;

  @ApiProperty({ description: "Cantidad del pedido original" })
  orderQuantity: number;

  @ApiProperty({
    description: "Cantidad elegida (la del pedido sin body; 0 si no incluida)",
  })
  quantity: number;

  @ApiProperty({ description: "Precio unitario congelado en el pedido" })
  orderUnitPrice: number;

  @ApiProperty({
    nullable: true,
    type: Number,
    description: "Precio unitario de hoy; null si no disponible",
  })
  currentUnitPrice: number | null;

  @ApiProperty()
  priceChanged: boolean;

  @ApiProperty({
    nullable: true,
    type: Number,
    description:
      "currentUnitPrice × quantity; null si no disponible o no incluida",
  })
  subtotal: number | null;

  @ApiProperty()
  isAvailable: boolean;

  @ApiProperty({
    nullable: true,
    enum: ["UNAVAILABLE", "CONFIGURATION", "NOT_FOUND"],
  })
  unavailableCode: LineAvailabilityCode | null;

  @ApiProperty({ nullable: true, type: String })
  unavailableReason: string | null;
}

export class RepeatPreviewResponseDto {
  @ApiProperty({ type: () => RepeatPreviewOrderDto })
  order: RepeatPreviewOrderDto;

  @ApiProperty({ type: () => [RepeatPreviewLineDto] })
  lines: RepeatPreviewLineDto[];

  @ApiProperty({
    nullable: true,
    type: Number,
    description:
      "Comensales de lo elegido (cajas incluidas y disponibles); null sin cajas",
  })
  diners: number | null;

  @ApiProperty({
    type: () => CartSummaryResponseDto,
    description:
      "Resumen de las líneas incluidas y disponibles con precios actuales (sin cupón)",
  })
  summary: CartSummaryResponseDto;

  @ApiProperty({
    description:
      "Líneas incluidas y disponibles cuyo precio actual difiere del del pedido",
  })
  priceChangedCount: number;
}
