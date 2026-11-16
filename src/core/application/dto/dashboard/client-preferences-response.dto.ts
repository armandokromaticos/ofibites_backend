import { ApiProperty } from "@nestjs/swagger";
import { RegistrationSolution } from "../../../domain/enums/registration-solution.enum";
import { PeoplePerOrderRange } from "../../../domain/enums/people-per-order-range.enum";
import { OrderFrequency } from "../../../domain/enums/order-frequency.enum";

export type ClientPreferencesSource = "registration" | "none";

/** Preferencias del equipo (T-45): respuestas de "¿Qué necesita tu equipo?" de la solicitud de ingreso. */
export class ClientPreferencesResponseDto {
  @ApiProperty({
    enum: ["registration", "none"],
    example: "registration",
    description:
      '"registration" si la empresa tiene solicitud de ingreso aprobada con soluciones; "none" si no',
  })
  source: ClientPreferencesSource;

  @ApiProperty({
    enum: RegistrationSolution,
    isArray: true,
    example: [
      RegistrationSolution.COFFEE_BREAK,
      RegistrationSolution.BEVERAGES,
    ],
    description:
      "Soluciones elegidas, sin duplicados y en el orden de la solicitud",
  })
  solutions: RegistrationSolution[];

  @ApiProperty({
    type: [String],
    example: ["coffee-break", "bebidas"],
    description:
      "Slugs de sección de cada solución, en el mismo orden; solo los que tienen sección activa en el catálogo",
  })
  sectionSlugs: string[];

  @ApiProperty({
    enum: PeoplePerOrderRange,
    nullable: true,
    example: PeoplePerOrderRange.FROM_11_TO_25,
  })
  peoplePerOrder: PeoplePerOrderRange | null;

  @ApiProperty({
    enum: OrderFrequency,
    nullable: true,
    example: OrderFrequency.WEEKLY,
  })
  orderFrequency: OrderFrequency | null;
}
