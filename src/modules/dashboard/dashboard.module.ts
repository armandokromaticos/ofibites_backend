import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DashboardController } from "./controllers/dashboard.controller";
import { DASHBOARD_REPOSITORY } from "../../core/domain/repositories/dashboard.repository.interface";
import { DashboardRepository } from "../../core/infrastructure/repositories/dashboard.repository";
import { OrderVisibilityResolver } from "../../core/application/services/order-visibility.resolver";
import { GetClientDashboardUseCase } from "../../core/application/use-cases/dashboard/get-client-dashboard.use-case";
import { GetAdminDashboardUseCase } from "../../core/application/use-cases/dashboard/get-admin-dashboard.use-case";
import { GetClientBranchBreakdownUseCase } from "../../core/application/use-cases/dashboard/get-client-branch-breakdown.use-case";
import { GetClientDepartmentBreakdownUseCase } from "../../core/application/use-cases/dashboard/get-client-department-breakdown.use-case";
import { GetClientUserBreakdownUseCase } from "../../core/application/use-cases/dashboard/get-client-user-breakdown.use-case";
import { ExportClientDashboardUseCase } from "../../core/application/use-cases/dashboard/export-client-dashboard.use-case";
import { GetClientPreferencesUseCase } from "../../core/application/use-cases/dashboard/get-client-preferences.use-case";
import { COMPANY_REGISTRATION_REQUEST_REPOSITORY } from "../../core/domain/repositories/company-registration-request.repository.interface";
import { CompanyRegistrationRequestRepository } from "../../core/infrastructure/repositories/company-registration-request.repository";
import { SECTION_REPOSITORY } from "../../core/domain/repositories/section.repository.interface";
import { SectionRepository } from "../../core/infrastructure/repositories/section.repository";

@Module({
  imports: [AuthModule],
  controllers: [DashboardController],
  providers: [
    { provide: DASHBOARD_REPOSITORY, useClass: DashboardRepository },
    OrderVisibilityResolver,
    GetClientDashboardUseCase,
    GetAdminDashboardUseCase,
    GetClientBranchBreakdownUseCase,
    GetClientDepartmentBreakdownUseCase,
    GetClientUserBreakdownUseCase,
    ExportClientDashboardUseCase,
    {
      provide: COMPANY_REGISTRATION_REQUEST_REPOSITORY,
      useClass: CompanyRegistrationRequestRepository,
    },
    { provide: SECTION_REPOSITORY, useClass: SectionRepository },
    GetClientPreferencesUseCase,
  ],
})
export class DashboardModule {}
