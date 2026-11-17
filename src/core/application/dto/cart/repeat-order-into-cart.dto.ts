import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from "class-validator";
import { REPEAT_EMPTY_SELECTION_MESSAGE } from "../../shared/repeat-order.util";

export const REPEAT_MAX_LINES = 100;
export const REPEAT_MAX_QUANTITY = 999;

export class RepeatOrderItemSelectionDto {
  @ApiProperty({ format: "uuid", description: "Id de la línea del pedido" })
  @IsUUID("all", { message: "orderItemId debe ser un UUID válido" })
  orderItemId: string;

  @ApiProperty({ minimum: 1, maximum: REPEAT_MAX_QUANTITY })
  @Type(() => Number)
  @IsInt({ message: "quantity debe ser un número entero" })
  @Min(1, { message: "quantity debe ser al menos 1" })
  @Max(REPEAT_MAX_QUANTITY, {
    message: `quantity no puede ser mayor que ${REPEAT_MAX_QUANTITY}`,
  })
  quantity: number;
}

/**
 * Body opcional de `POST /cart/repeat/:orderId` y de su vista previa (T-38).
 * Sin `items`: todas las líneas del pedido con su cantidad original.
 */
export class RepeatOrderIntoCartDto {
  @ApiPropertyOptional({
    type: () => [RepeatOrderItemSelectionDto],
    description:
      "Líneas del pedido a repetir y su cantidad. Las que no vienen no se copian.",
  })
  @IsOptional()
  @IsArray({ message: "items debe ser una lista" })
  @ArrayMinSize(1, { message: REPEAT_EMPTY_SELECTION_MESSAGE })
  @ArrayMaxSize(REPEAT_MAX_LINES, {
    message: `items admite como máximo ${REPEAT_MAX_LINES} líneas`,
  })
  @ValidateNested({ each: true })
  @Type(() => RepeatOrderItemSelectionDto)
  items?: RepeatOrderItemSelectionDto[];
}
