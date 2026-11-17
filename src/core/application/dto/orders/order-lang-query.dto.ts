import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsOptional } from "class-validator";
import { Lang } from "../../../domain/enums/lang.enum";

/**
 * `?lang=es|en` de `GET /orders` y `GET /orders/:id` (T-38): idioma de
 * `name`, `sizeLabel`, `sizeDescription`, `description` y de los modificadores.
 */
export class OrderLangQueryDto {
  @ApiPropertyOptional({ enum: Lang, default: Lang.ES })
  @IsOptional()
  @IsEnum(Lang, { message: "lang solo admite: es, en" })
  lang?: Lang;
}
