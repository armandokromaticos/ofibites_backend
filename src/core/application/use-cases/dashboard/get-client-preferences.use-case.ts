import { Inject, Injectable } from "@nestjs/common";
import { RegistrationSolution } from "../../../domain/enums/registration-solution.enum";
import type { ICompanyRegistrationRequestRepository } from "../../../domain/repositories/company-registration-request.repository.interface";
import { COMPANY_REGISTRATION_REQUEST_REPOSITORY } from "../../../domain/repositories/company-registration-request.repository.interface";
import type { ISectionRepository } from "../../../domain/repositories/section.repository.interface";
import { SECTION_REPOSITORY } from "../../../domain/repositories/section.repository.interface";
import { ClientPreferencesResponseDto } from "../../dto/dashboard/client-preferences-response.dto";

/** Mapeo fijo solución de la solicitud de ingreso → slug de `Section` (contrato T-45). */
export const SOLUTION_SECTION_SLUG: Record<RegistrationSolution, string> = {
  [RegistrationSolution.COFFEE_BREAK]: "coffee-break",
  [RegistrationSolution.WORKING_LUNCH]: "working-lunch",
  [RegistrationSolution.SNACKS]: "snacks",
  [RegistrationSolution.DESSERTS]: "postres",
  [RegistrationSolution.BEVERAGES]: "bebidas",
};

/** Respuesta sin preferencias; función para no compartir arrays entre requests. */
const sinPreferencias = (): ClientPreferencesResponseDto => ({
  source: "none",
  solutions: [],
  sectionSlugs: [],
  peoplePerOrder: null,
  orderFrequency: null,
});

/**
 * Preferencias del equipo de la empresa activa (T-45), sacadas de la solicitud
 * de ingreso que la dio de alta. Sin solicitud o sin soluciones → `source: "none"`.
 */
@Injectable()
export class GetClientPreferencesUseCase {
  constructor(
    @Inject(COMPANY_REGISTRATION_REQUEST_REPOSITORY)
    private readonly registrationRequestRepository: ICompanyRegistrationRequestRepository,
    @Inject(SECTION_REPOSITORY)
    private readonly sectionRepository: ISectionRepository,
  ) {}

  async execute(companyId: string): Promise<ClientPreferencesResponseDto> {
    const request = await this.registrationRequestRepository.findUnique({
      where: { approvedCompanyId: companyId },
    });

    const solutions = [...new Set(request?.interestedSolutions ?? [])];
    if (!request || solutions.length === 0) {
      return sinPreferencias();
    }

    const candidateSlugs = solutions.map((s) => SOLUTION_SECTION_SLUG[s]);
    const { data: activeSections } = await this.sectionRepository.findMany({
      where: { slug: { in: candidateSlugs }, isActive: true },
    });
    const activeSlugs = new Set(activeSections.map((s) => s.slug));

    return {
      source: "registration",
      solutions,
      sectionSlugs: candidateSlugs.filter((slug) => activeSlugs.has(slug)),
      peoplePerOrder: request.peoplePerOrder,
      orderFrequency: request.orderFrequency,
    };
  }
}
