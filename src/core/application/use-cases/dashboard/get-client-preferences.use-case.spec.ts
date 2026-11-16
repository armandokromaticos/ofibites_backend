import { GetClientPreferencesUseCase } from "./get-client-preferences.use-case";
import { RegistrationSolution } from "../../../domain/enums/registration-solution.enum";
import { PeoplePerOrderRange } from "../../../domain/enums/people-per-order-range.enum";
import { OrderFrequency } from "../../../domain/enums/order-frequency.enum";
import type { ICompanyRegistrationRequestRepository } from "../../../domain/repositories/company-registration-request.repository.interface";
import type { ISectionRepository } from "../../../domain/repositories/section.repository.interface";
import type { CompanyRegistrationRequestEntity } from "../../../domain/entities/company-registration-request.entity";
import type { SectionEntity } from "../../../domain/entities/section.entity";

const COMPANY_ID = "11111111-1111-4111-8111-111111111111";

function solicitud(
  interestedSolutions: RegistrationSolution[],
): CompanyRegistrationRequestEntity {
  return {
    interestedSolutions,
    peoplePerOrder: PeoplePerOrderRange.FROM_11_TO_25,
    orderFrequency: OrderFrequency.WEEKLY,
  } as CompanyRegistrationRequestEntity;
}

function setup(
  request: CompanyRegistrationRequestEntity | null,
  activeSlugs: string[],
) {
  const findRequest = jest.fn().mockResolvedValue(request);
  const findSections = jest.fn().mockResolvedValue({
    data: activeSlugs.map((slug) => ({ slug }) as SectionEntity),
  });
  const useCase = new GetClientPreferencesUseCase(
    {
      findUnique: findRequest,
    } as unknown as ICompanyRegistrationRequestRepository,
    { findMany: findSections } as unknown as ISectionRepository,
  );
  return { useCase, findRequest, findSections };
}

describe("GetClientPreferencesUseCase (T-45)", () => {
  it("con solicitud: devuelve soluciones, slugs, personas y frecuencia leyendo la solicitud de la empresa", async () => {
    const { useCase, findRequest, findSections } = setup(
      solicitud([
        RegistrationSolution.COFFEE_BREAK,
        RegistrationSolution.BEVERAGES,
      ]),
      ["bebidas", "coffee-break"],
    );

    const result = await useCase.execute(COMPANY_ID);

    expect(result).toEqual({
      source: "registration",
      solutions: ["COFFEE_BREAK", "BEVERAGES"],
      sectionSlugs: ["coffee-break", "bebidas"],
      peoplePerOrder: "FROM_11_TO_25",
      orderFrequency: "WEEKLY",
    });
    expect(findRequest).toHaveBeenCalledWith({
      where: { approvedCompanyId: COMPANY_ID },
    });
    expect(findSections).toHaveBeenCalledWith({
      where: { slug: { in: ["coffee-break", "bebidas"] }, isActive: true },
    });
  });

  it("sin solicitud: source none con todo vacío y sin consultar secciones", async () => {
    const { useCase, findSections } = setup(null, []);

    const result = await useCase.execute(COMPANY_ID);

    expect(result).toEqual({
      source: "none",
      solutions: [],
      sectionSlugs: [],
      peoplePerOrder: null,
      orderFrequency: null,
    });
    expect(findSections).not.toHaveBeenCalled();
  });

  it("solicitud sin soluciones: source none (aunque tenga personas y frecuencia)", async () => {
    const { useCase, findSections } = setup(solicitud([]), []);

    const result = await useCase.execute(COMPANY_ID);

    expect(result.source).toBe("none");
    expect(result.peoplePerOrder).toBeNull();
    expect(result.orderFrequency).toBeNull();
    expect(findSections).not.toHaveBeenCalled();
  });

  it("soluciones sin sección activa: siguen en solutions pero no en sectionSlugs", async () => {
    const { useCase } = setup(
      solicitud([
        RegistrationSolution.DESSERTS,
        RegistrationSolution.WORKING_LUNCH,
        RegistrationSolution.SNACKS,
      ]),
      ["working-lunch"],
    );

    const result = await useCase.execute(COMPANY_ID);

    expect(result.source).toBe("registration");
    expect(result.solutions).toEqual(["DESSERTS", "WORKING_LUNCH", "SNACKS"]);
    expect(result.sectionSlugs).toEqual(["working-lunch"]);
  });

  it("respeta el orden de la solicitud (no el de las secciones) y quita duplicados", async () => {
    const { useCase } = setup(
      solicitud([
        RegistrationSolution.BEVERAGES,
        RegistrationSolution.DESSERTS,
        RegistrationSolution.BEVERAGES,
        RegistrationSolution.SNACKS,
        RegistrationSolution.COFFEE_BREAK,
      ]),
      ["coffee-break", "snacks", "postres", "bebidas"],
    );

    const result = await useCase.execute(COMPANY_ID);

    expect(result.solutions).toEqual([
      "BEVERAGES",
      "DESSERTS",
      "SNACKS",
      "COFFEE_BREAK",
    ]);
    expect(result.sectionSlugs).toEqual([
      "bebidas",
      "postres",
      "snacks",
      "coffee-break",
    ]);
  });
});
