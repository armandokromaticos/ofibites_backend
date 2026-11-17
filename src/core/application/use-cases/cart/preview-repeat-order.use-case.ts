import { Inject, Injectable } from "@nestjs/common";
import type { IOrderRepository } from "../../../domain/repositories/order.repository.interface";
import { ORDER_REPOSITORY } from "../../../domain/repositories/order.repository.interface";
import type { ICompanyRepository } from "../../../domain/repositories/company.repository.interface";
import { COMPANY_REPOSITORY } from "../../../domain/repositories/company.repository.interface";
import type { ICompanyMemberRepository } from "../../../domain/repositories/company-member.repository.interface";
import { COMPANY_MEMBER_REPOSITORY } from "../../../domain/repositories/company-member.repository.interface";
import {
  describeOrderLine,
  OrderEntity,
} from "../../../domain/entities/order.entity";
import { Lang } from "../../../domain/enums/lang.enum";
import { Role } from "../../../domain/enums/role.enum";
import { computeDiners } from "../../../domain/services/order-composition";
import { toCents } from "../../../domain/services/order-summary";
import type { LineAvailabilityCode } from "../../../domain/services/line-availability";
import {
  LineItemInput,
  LineItemPricingService,
} from "../../services/line-item-pricing.service";
import {
  LineItemAvailabilityService,
  resolveUnavailabilityCode,
} from "../../services/line-item-availability.service";
import { assertCompanyActive } from "../../shared/company-active.guard";
import { buildOrderSummary } from "../../shared/order-summary.config";
import {
  findRepeatOrderInCompany,
  RepeatActorRef,
  RepeatSelectionItem,
  resolveRepeatSelection,
} from "../../shared/repeat-order.util";
import {
  RepeatPreviewLineDto,
  RepeatPreviewOrderDto,
  RepeatPreviewResponseDto,
} from "../../dto/cart/repeat-preview-response.dto";
import { toSkipReason } from "./repeat-order-into-cart.use-case";

/** Precio base + Σ ajustes de los modificadores, sumado en céntimos. */
export function effectiveUnitPrice(
  unitPrice: number,
  modifiers: readonly { priceAdjustment: number }[],
): number {
  const cents = modifiers.reduce(
    (sum, modifier) => sum + toCents(modifier.priceAdjustment),
    toCents(unitPrice),
  );
  return cents / 100;
}

/**
 * Vista previa de "Repetir pedido" (`POST /cart/repeat/:orderId/preview`, T-38):
 * por línea, disponibilidad (misma regla que repetir al carrito) y precio de
 * hoy frente al congelado; resumen calculado en el servidor con lo elegido.
 * No escribe nada (ni carrito ni pedido).
 */
@Injectable()
export class PreviewRepeatOrderUseCase {
  constructor(
    @Inject(ORDER_REPOSITORY)
    private readonly orderRepository: IOrderRepository,
    @Inject(COMPANY_REPOSITORY)
    private readonly companyRepository: ICompanyRepository,
    @Inject(COMPANY_MEMBER_REPOSITORY)
    private readonly companyMemberRepository: ICompanyMemberRepository,
    private readonly lineItemPricingService: LineItemPricingService,
    private readonly lineItemAvailability: LineItemAvailabilityService,
  ) {}

  async execute(
    companyId: string,
    actor: RepeatActorRef,
    orderId: string,
    items?: RepeatSelectionItem[],
    lang: Lang = Lang.ES,
  ): Promise<RepeatPreviewResponseDto> {
    await assertCompanyActive(companyId, {
      companyRepository: this.companyRepository,
    });
    const order = await findRepeatOrderInCompany(
      {
        orderRepository: this.orderRepository,
        companyMemberRepository: this.companyMemberRepository,
      },
      companyId,
      actor,
      orderId,
    );
    const selection = resolveRepeatSelection(order.items ?? [], items);

    // Disponibilidad línea a línea (también de las quitadas, para el motivo).
    const codes: (LineAvailabilityCode | null)[] = [];
    for (const { item } of selection) {
      codes.push(
        await resolveUnavailabilityCode(
          this.lineItemAvailability,
          this.lineItemPricingService,
          this.toInput(item, item.quantity),
        ),
      );
    }

    // Precio de hoy de las disponibles, en un solo lote. Las quitadas se
    // cotizan con su cantidad original (solo interesa el precio unitario).
    const availableIndexes = selection
      .map((_, index) => index)
      .filter((index) => codes[index] === null);
    const priced =
      availableIndexes.length === 0
        ? []
        : await this.lineItemPricingService.priceLines(
            availableIndexes.map((index) => {
              const { item, quantity, included } = selection[index];
              return this.toInput(item, included ? quantity : item.quantity);
            }),
          );
    const pricedByIndex = new Map(
      availableIndexes.map((index, position) => [index, priced[position]]),
    );

    const lines = selection.map(({ item, quantity, included }, index) => {
      const code = codes[index];
      const current = pricedByIndex.get(index);
      const line = new RepeatPreviewLineDto();
      line.orderItemId = item.id as string;
      line.productId = item.productId;
      line.productSizeId = item.productSizeId;
      line.comboId = item.comboId;
      Object.assign(line, describeOrderLine(item, lang));
      line.included = included;
      line.orderQuantity = item.quantity;
      line.quantity = quantity;
      // Precio unitario efectivo (base + extras): el del pedido con los ajustes
      // congelados frente al de hoy. Así subtotal = currentUnitPrice × quantity
      // y un extra que sube también cuenta como cambio de precio.
      line.orderUnitPrice = effectiveUnitPrice(item.unitPrice, item.modifiers);
      line.currentUnitPrice = current
        ? effectiveUnitPrice(current.unitPrice, current.modifiers)
        : null;
      line.priceChanged =
        line.currentUnitPrice !== null &&
        toCents(line.currentUnitPrice) !== toCents(line.orderUnitPrice);
      line.subtotal = current && included ? current.subtotal : null;
      line.isAvailable = code === null;
      line.unavailableCode = code;
      line.unavailableReason = code ? toSkipReason(code) : null;
      return line;
    });

    const chosen = lines.filter((line) => line.included && line.isAvailable);
    const response = new RepeatPreviewResponseDto();
    response.order = this.toOrderDto(order, actor.role);
    response.lines = lines;
    response.diners = computeDiners(chosen);
    response.summary = buildOrderSummary(
      chosen.map((line) => line.subtotal ?? 0),
    );
    response.priceChangedCount = chosen.filter(
      (line) => line.priceChanged,
    ).length;
    return response;
  }

  private toInput(
    item: NonNullable<OrderEntity["items"]>[number],
    quantity: number,
  ): LineItemInput {
    return {
      productId: item.productId,
      productSizeId: item.productSizeId,
      comboId: item.comboId,
      quantity,
      modifiers: item.modifiers.map((m) => ({ modifierId: m.modifierId })),
    };
  }

  private toOrderDto(order: OrderEntity, role: Role): RepeatPreviewOrderDto {
    const dto = new RepeatPreviewOrderDto();
    dto.id = order.id as string;
    dto.orderNumber = order.orderNumber;
    dto.createdAt = order.createdAt;
    dto.deliveryDate = order.deliveryDate;
    dto.deliveryTime = order.deliveryTime;
    dto.deliveryAddressId = order.deliveryAddressId;
    dto.receiverName = order.receiverName;
    dto.receiverPhone = order.receiverPhone;
    dto.addressDetail = order.addressDetail;
    dto.addressReference = order.addressReference;
    dto.diners = order.diners;
    // Mismo criterio que OrderResponseDto: OPERATOR no ve precios.
    dto.total = role === Role.OPERATOR ? null : order.total;
    return dto;
  }
}
