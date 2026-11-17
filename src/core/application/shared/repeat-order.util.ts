import { BadRequestException, NotFoundException } from "@nestjs/common";
import type { IOrderRepository } from "../../domain/repositories/order.repository.interface";
import { ORDER_FULL_INCLUDE } from "../../domain/repositories/order.repository.interface";
import type { ICompanyMemberRepository } from "../../domain/repositories/company-member.repository.interface";
import { OrderEntity } from "../../domain/entities/order.entity";
import { Role } from "../../domain/enums/role.enum";
import { assertCanReadOrder } from "./order-read-access";

/** `code` estable de los 400 de negocio del body de repetir (T-38). */
export const RepeatErrorCode = {
  REPEAT_ITEM_DUPLICATED: "REPEAT_ITEM_DUPLICATED",
  REPEAT_ITEM_NOT_IN_ORDER: "REPEAT_ITEM_NOT_IN_ORDER",
} as const;

export type RepeatErrorCode =
  (typeof RepeatErrorCode)[keyof typeof RepeatErrorCode];

export const REPEAT_EMPTY_SELECTION_MESSAGE =
  "Elige al menos un producto para repetir";

/** Lo que el usuario dejó en el editor de repetir: línea del pedido + cantidad. */
export interface RepeatSelectionItem {
  orderItemId: string;
  quantity: number;
}

export interface RepeatActorRef {
  id: string;
  role: Role;
}

/** Línea del pedido con la cantidad a repetir (`included = false`: el usuario la quitó). */
export interface SelectedRepeatLine<T> {
  item: T;
  quantity: number;
  included: boolean;
}

function repeatBadRequest(
  code: RepeatErrorCode,
  message: string,
): BadRequestException {
  return new BadRequestException({
    statusCode: 400,
    error: "Bad Request",
    message,
    code,
  });
}

/**
 * Cruza las líneas del pedido con lo editado. Sin `selection`, todas las
 * líneas con su cantidad original (comportamiento anterior a T-38). Con
 * `selection`, solo esas líneas y con esas cantidades; el resto queda con
 * `included = false`. Mantiene el orden del pedido.
 *
 * 400 si la selección está vacía, repite una línea o trae una que no es del
 * pedido.
 */
export function resolveRepeatSelection<
  T extends { id: string | undefined; quantity: number },
>(
  items: readonly T[],
  selection?: RepeatSelectionItem[],
): SelectedRepeatLine<T>[] {
  if (!selection) {
    return items.map((item) => ({
      item,
      quantity: item.quantity,
      included: true,
    }));
  }
  if (selection.length === 0) {
    throw new BadRequestException(REPEAT_EMPTY_SELECTION_MESSAGE);
  }

  const orderItemIds = new Set(items.map((item) => item.id));
  const quantities = new Map<string, number>();
  for (const chosen of selection) {
    if (quantities.has(chosen.orderItemId)) {
      throw repeatBadRequest(
        RepeatErrorCode.REPEAT_ITEM_DUPLICATED,
        `La línea ${chosen.orderItemId} está repetida`,
      );
    }
    if (!orderItemIds.has(chosen.orderItemId)) {
      throw repeatBadRequest(
        RepeatErrorCode.REPEAT_ITEM_NOT_IN_ORDER,
        `La línea ${chosen.orderItemId} no pertenece al pedido`,
      );
    }
    quantities.set(chosen.orderItemId, chosen.quantity);
  }

  return items.map((item) => {
    const quantity = item.id ? quantities.get(item.id) : undefined;
    return quantity === undefined
      ? { item, quantity: 0, included: false }
      : { item, quantity, included: true };
  });
}

/**
 * Pedido a repetir por id: debe ser de la empresa del header (si no, o si no
 * existe, 404 sin distinguir) y legible por el usuario (`assertCanReadOrder`,
 * 403). Lo comparten `POST /cart/repeat/:orderId` y su vista previa.
 */
export async function findRepeatOrderInCompany(
  deps: {
    orderRepository: IOrderRepository;
    companyMemberRepository: ICompanyMemberRepository;
  },
  companyId: string,
  actor: RepeatActorRef,
  orderId: string,
): Promise<OrderEntity> {
  const order = await deps.orderRepository.findUnique({
    where: { id: orderId },
    include: ORDER_FULL_INCLUDE,
  });
  // Un pedido de otra empresa responde igual que uno inexistente.
  if (!order || order.companyId !== companyId) {
    throw new NotFoundException("Pedido no encontrado en esta empresa");
  }
  await assertCanReadOrder(order, actor.id, actor.role, {
    companyMemberRepository: deps.companyMemberRepository,
  });
  return order;
}
