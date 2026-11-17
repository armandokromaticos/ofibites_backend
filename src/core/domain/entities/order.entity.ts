import {
  Order as PrismaOrder,
  OrderItem as PrismaOrderItem,
  OrderItemModifier as PrismaOrderItemModifier,
  Prisma,
} from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { OrderStatus } from "../enums/order-status.enum";
import { OrderPriority } from "../enums/order-priority.enum";
import {
  OrderResponseDto,
  OrderItemResponseDto,
  OrderItemModifierResponseDto,
  OrderStatusHistoryEntryDto,
} from "../../application/dto/orders/order-response.dto";
import { Lang } from "../enums/lang.enum";
import {
  computeDiners,
  OrderLineKind,
  orderLineKind,
} from "../services/order-composition";
import { OrderStateMachine } from "../services/order-state-machine";
import { getOrderStatusGroup } from "../services/order-status-groups";
import { Money } from "../value-objects/money.vo";
import { InvoiceEntity, PrismaInvoiceRow } from "./invoice.entity";

// Las columnas del checkout son opcionales para aceptar filas parciales (fixtures).
type CheckoutOrderColumns =
  | "tax"
  | "shipping"
  | "orderNumber"
  | "receiverName"
  | "receiverPhone"
  | "addressDetail"
  | "addressReference"
  | "taxRate";

/** Textos bilingües del catálogo (producto, tamaño o combo). */
interface LocalizedText {
  nameEs: string;
  nameEn: string | null;
  descriptionEs: string | null;
  descriptionEn: string | null;
}

/** Datos del catálogo actual de una línea (T-38, `ORDER_FULL_INCLUDE`). */
export interface OrderItemCatalogInfo {
  product?: (LocalizedText & { image: string | null }) | null;
  productSize?: (LocalizedText & { servings: number | null }) | null;
  combo?: (LocalizedText & { image: string | null }) | null;
}

export interface OrderPersonRef {
  id: string;
  name: string;
}

export interface OrderStatusHistoryEntry {
  status: OrderStatus;
  at: Date;
  estimated: boolean;
}

type PrismaOrderWithRelations = Omit<PrismaOrder, CheckoutOrderColumns> & {
  couponId?: string | null;
  subtotal?: Decimal;
  discount?: Decimal;
  tax?: Decimal;
  shipping?: Decimal;
  taxRate?: Decimal;
  orderNumber?: string | null;
  receiverName?: string | null;
  receiverPhone?: string | null;
  addressDetail?: string | null;
  addressReference?: string | null;
  items?: (PrismaOrderItem &
    OrderItemCatalogInfo & {
      modifiers?: (PrismaOrderItemModifier & {
        modifier?: { nameEs: string; nameEn: string | null } | null;
      })[];
    })[];
  invoice?: PrismaInvoiceRow | null;
  user?: OrderPersonRef | null;
  createdBy?: OrderPersonRef | null;
  department?: OrderPersonRef | null;
  statusHistory?: {
    toStatus: PrismaOrder["status"];
    changedAt: Date;
    estimated: boolean;
  }[];
};

interface OrderItemModifierInfo {
  id: string | undefined;
  modifierId: string;
  priceAdjustment: number;
  /** T-38: undefined si no se cargó el modificador. */
  nameEs?: string;
  nameEn?: string | null;
}

interface OrderItemInfo {
  id: string | undefined;
  productId: string;
  productSizeId: string | null;
  comboId: string | null;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  modifiers: OrderItemModifierInfo[];
  /** T-38: undefined si la fila no trajo el catálogo (entidad sin persistir). */
  catalog?: OrderItemCatalogInfo;
}

/** `servings` del tamaño elegido de una línea (null sin tamaño o sin catálogo). */
function itemServings(item: OrderItemInfo): number | null {
  return item.catalog?.productSize?.servings ?? null;
}

/** Texto en `lang`; EN cae a ES si falta o está vacío. */
export function localizedText(
  lang: Lang,
  es: string,
  en: string | null,
): string {
  return lang === Lang.EN ? en?.trim() || es : es;
}

function localizedOptional(
  lang: Lang,
  es: string | null,
  en: string | null,
): string | null {
  return lang === Lang.EN ? en?.trim() || es : es;
}

export interface OrderLineDescription {
  kind: OrderLineKind;
  name: string;
  image: string | null;
  sizeLabel: string | null;
  sizeDescription: string | null;
  description: string | null;
  servings: number | null;
}

/**
 * Presentación de una línea con el catálogo actual (T-38): caja/complemento,
 * nombre (del combo si hay comboId, si no del producto), tamaño y descripciones.
 * Lo comparten `OrderResponseDto` y la vista previa de repetir.
 */
export function describeOrderLine(
  item: Pick<OrderItemInfo, "comboId" | "catalog">,
  lang: Lang,
): OrderLineDescription {
  const main = item.comboId ? item.catalog?.combo : item.catalog?.product;
  const size = item.catalog?.productSize ?? null;
  const servings = size?.servings ?? null;
  const fallbackName = item.comboId
    ? "Combo"
    : lang === Lang.EN
      ? "Product"
      : "Producto";
  return {
    kind: orderLineKind(servings),
    name: main ? localizedText(lang, main.nameEs, main.nameEn) : fallbackName,
    image: main?.image ?? null,
    sizeLabel: size ? localizedText(lang, size.nameEs, size.nameEn) : null,
    sizeDescription: size
      ? localizedOptional(lang, size.descriptionEs, size.descriptionEn)
      : null,
    description: main
      ? localizedOptional(lang, main.descriptionEs, main.descriptionEn)
      : null,
    servings,
  };
}

interface OrderProps {
  id: string | undefined;
  userId: string | null;
  couponId: string | null;
  companyId: string;
  branchId: string | null;
  departmentId: string | null;
  createdById: string;
  deliveryAddressId: string;
  deliveryDate: Date | null;
  deliveryTime: string | null;
  notes: string | null;
  priority: OrderPriority;
  status: OrderStatus;
  subtotal: number;
  discount: number;
  tax: number;
  shipping: number;
  /** T-38: tasa de IVA congelada (0.16 en el checkout, 0 sin IVA). */
  taxRate: number;
  total: number;
  orderNumber: string | null;
  receiverName: string | null;
  receiverPhone: string | null;
  addressDetail: string | null;
  addressReference: string | null;
  createdAt: Date;
  updatedAt: Date;
  items?: OrderItemInfo[];
  /** T-06: undefined = no se cargó; null = sin factura. */
  invoice?: InvoiceEntity | null;
  /** T-38: quien hizo el pedido (user, o createdBy si no hay userId). */
  user?: OrderPersonRef | null;
  department?: OrderPersonRef | null;
  /** T-38: solo con `ORDER_DETAIL_INCLUDE` (GET /orders/:id). */
  statusHistory?: OrderStatusHistoryEntry[];
}

export interface CreateOrderItemModifierParams {
  modifierId: string;
  priceAdjustment: number;
}

export interface CreateOrderItemParams {
  productId: string;
  productSizeId?: string;
  comboId?: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  modifiers: CreateOrderItemModifierParams[];
}

export interface CreateOrderParams {
  userId: string;
  companyId: string;
  createdById: string;
  deliveryAddressId: string;
  couponId?: string;
  branchId?: string;
  departmentId?: string;
  deliveryDate?: Date;
  deliveryTime?: string;
  notes?: string;
  priority?: OrderPriority;
  subtotal: number;
  discount: number;
  /** IVA y envío (checkout). Por defecto 0, como los pedidos de POST /orders. */
  tax?: number;
  shipping?: number;
  /** Tasa de IVA aplicada (checkout). Por defecto 0. */
  taxRate?: number;
  total: number;
  receiverName?: string;
  receiverPhone?: string;
  addressDetail?: string;
  addressReference?: string;
  items: CreateOrderItemParams[];
}

export class OrderEntity {
  private static readonly stateMachine = new OrderStateMachine();
  private props: OrderProps;

  constructor(props: OrderProps) {
    this.props = props;
  }

  get id(): string | undefined {
    return this.props.id;
  }
  get userId(): string | null {
    return this.props.userId;
  }
  get couponId(): string | null {
    return this.props.couponId;
  }
  get companyId(): string {
    return this.props.companyId;
  }
  get branchId(): string | null {
    return this.props.branchId;
  }
  get departmentId(): string | null {
    return this.props.departmentId;
  }
  get createdById(): string {
    return this.props.createdById;
  }
  get deliveryAddressId(): string {
    return this.props.deliveryAddressId;
  }
  get deliveryDate(): Date | null {
    return this.props.deliveryDate;
  }
  get deliveryTime(): string | null {
    return this.props.deliveryTime;
  }
  get notes(): string | null {
    return this.props.notes;
  }
  get priority(): OrderPriority {
    return this.props.priority;
  }
  get status(): OrderStatus {
    return this.props.status;
  }
  get subtotal(): number {
    return this.props.subtotal;
  }
  get discount(): number {
    return this.props.discount;
  }
  get total(): number {
    return this.props.total;
  }
  get tax(): number {
    return this.props.tax;
  }
  get shipping(): number {
    return this.props.shipping;
  }
  /** OF-AAAA-NNNN; null solo en pedidos sin backfill o aún no persistidos. */
  get orderNumber(): string | null {
    return this.props.orderNumber;
  }
  get receiverName(): string | null {
    return this.props.receiverName;
  }
  get receiverPhone(): string | null {
    return this.props.receiverPhone;
  }
  get addressDetail(): string | null {
    return this.props.addressDetail;
  }
  get addressReference(): string | null {
    return this.props.addressReference;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }
  get items(): OrderItemInfo[] | undefined {
    return this.props.items;
  }
  get invoice(): InvoiceEntity | null | undefined {
    return this.props.invoice;
  }
  get taxRate(): number {
    return this.props.taxRate;
  }
  get user(): OrderPersonRef | null | undefined {
    return this.props.user;
  }
  get department(): OrderPersonRef | null | undefined {
    return this.props.department;
  }
  get statusHistory(): OrderStatusHistoryEntry[] | undefined {
    return this.props.statusHistory;
  }
  /** T-38: comensales calculados con las cajas (null sin cajas o sin líneas). */
  get diners(): number | null {
    return computeDiners(
      (this.props.items ?? []).map((item) => ({
        servings: itemServings(item),
        quantity: item.quantity,
      })),
    );
  }

  canTransitionTo(status: OrderStatus): boolean {
    return OrderEntity.stateMachine.canTransition(this.props.status, status);
  }

  calculateTotal(): Money {
    if (!this.props.items || this.props.items.length === 0) {
      return Money.zero();
    }

    let total = Money.zero();
    for (const item of this.props.items) {
      const unitPrice = Money.create(item.unitPrice);
      const modifiersAdjustment = Money.create(
        item.modifiers.reduce(
          (sum, modifier) => sum + modifier.priceAdjustment,
          0,
        ),
      );
      const itemTotal = unitPrice
        .add(modifiersAdjustment)
        .multiply(item.quantity);
      total = total.add(itemTotal);
    }

    return total;
  }

  static fromCreateDto(params: CreateOrderParams): OrderEntity {
    return new OrderEntity({
      id: undefined,
      userId: params.userId,
      couponId: params.couponId ?? null,
      companyId: params.companyId,
      branchId: params.branchId ?? null,
      departmentId: params.departmentId ?? null,
      createdById: params.createdById,
      deliveryAddressId: params.deliveryAddressId,
      deliveryDate: params.deliveryDate ?? null,
      deliveryTime: params.deliveryTime ?? null,
      notes: params.notes ?? null,
      priority: params.priority ?? OrderPriority.MEDIUM,
      status: OrderStatus.CREATED,
      subtotal: params.subtotal,
      discount: params.discount,
      tax: params.tax ?? 0,
      shipping: params.shipping ?? 0,
      taxRate: params.taxRate ?? 0,
      total: params.total,
      // Lo asigna el repositorio dentro de la transacción de creación.
      orderNumber: null,
      receiverName: params.receiverName ?? null,
      receiverPhone: params.receiverPhone ?? null,
      addressDetail: params.addressDetail ?? null,
      addressReference: params.addressReference ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
      items: params.items.map((item) => ({
        id: undefined,
        productId: item.productId,
        productSizeId: item.productSizeId ?? null,
        comboId: item.comboId ?? null,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        subtotal: item.subtotal,
        modifiers: item.modifiers.map((modifier) => ({
          id: undefined,
          modifierId: modifier.modifierId,
          priceAdjustment: modifier.priceAdjustment,
        })),
      })),
    });
  }

  /** `orderNumber` lo genera el repositorio (contador por año, en la transacción). */
  toPrismaCreate(orderNumber?: string): Prisma.OrderCreateInput {
    const data: Prisma.OrderCreateInput = {
      priority: this.props.priority,
      subtotal: new Prisma.Decimal(this.props.subtotal),
      discount: new Prisma.Decimal(this.props.discount),
      tax: new Prisma.Decimal(this.props.tax),
      shipping: new Prisma.Decimal(this.props.shipping),
      taxRate: new Prisma.Decimal(this.props.taxRate),
      total: new Prisma.Decimal(this.props.total),
      orderNumber: orderNumber ?? this.props.orderNumber,
      receiverName: this.props.receiverName,
      receiverPhone: this.props.receiverPhone,
      addressDetail: this.props.addressDetail,
      addressReference: this.props.addressReference,
      deliveryDate: this.props.deliveryDate,
      deliveryTime: this.props.deliveryTime,
      notes: this.props.notes,
      company: { connect: { id: this.props.companyId } },
      createdBy: { connect: { id: this.props.createdById } },
      deliveryAddress: {
        connect: {
          companyId_id: {
            companyId: this.props.companyId,
            id: this.props.deliveryAddressId,
          },
        },
      },
      items: {
        create: (this.props.items ?? []).map((item) => ({
          product: { connect: { id: item.productId } },
          productSize: item.productSizeId
            ? { connect: { id: item.productSizeId } }
            : undefined,
          combo: item.comboId ? { connect: { id: item.comboId } } : undefined,
          quantity: item.quantity,
          unitPrice: new Prisma.Decimal(item.unitPrice),
          subtotal: new Prisma.Decimal(item.subtotal),
          modifiers: {
            create: item.modifiers.map((modifier) => ({
              modifier: { connect: { id: modifier.modifierId } },
              priceAdjustment: new Prisma.Decimal(modifier.priceAdjustment),
            })),
          },
        })),
      },
      // T-38: primera fila del historial, en la misma escritura (y por tanto en
      // la misma transacción) que el pedido.
      statusHistory: {
        create: {
          fromStatus: null,
          toStatus: this.props.status,
          changedBy: { connect: { id: this.props.createdById } },
        },
      },
    };

    if (this.props.userId) {
      data.user = { connect: { id: this.props.userId } };
    }
    if (this.props.couponId) {
      data.coupon = { connect: { id: this.props.couponId } };
    }
    if (this.props.branchId) {
      data.branch = {
        connect: {
          companyId_id: {
            companyId: this.props.companyId,
            id: this.props.branchId,
          },
        },
      };
    }
    if (this.props.departmentId) {
      data.department = {
        connect: {
          companyId_id: {
            companyId: this.props.companyId,
            id: this.props.departmentId,
          },
        },
      };
    }

    return data;
  }

  static fromPrisma(prisma: PrismaOrderWithRelations): OrderEntity {
    const props: OrderProps = {
      id: prisma.id,
      userId: prisma.userId ?? null,
      couponId: prisma.couponId ?? null,
      companyId: prisma.companyId,
      branchId: prisma.branchId ?? null,
      departmentId: prisma.departmentId ?? null,
      createdById: prisma.createdById,
      deliveryAddressId: prisma.deliveryAddressId,
      deliveryDate: prisma.deliveryDate ?? null,
      deliveryTime: prisma.deliveryTime ?? null,
      notes: prisma.notes ?? null,
      priority: prisma.priority as OrderPriority,
      status: prisma.status as OrderStatus,
      subtotal: Number(prisma.subtotal ?? prisma.total),
      discount: Number(prisma.discount ?? 0),
      tax: Number(prisma.tax ?? 0),
      shipping: Number(prisma.shipping ?? 0),
      taxRate: Number(prisma.taxRate ?? 0),
      total: Number(prisma.total),
      orderNumber: prisma.orderNumber ?? null,
      receiverName: prisma.receiverName ?? null,
      receiverPhone: prisma.receiverPhone ?? null,
      addressDetail: prisma.addressDetail ?? null,
      addressReference: prisma.addressReference ?? null,
      createdAt: prisma.createdAt,
      updatedAt: prisma.updatedAt,
    };

    if (prisma.invoice !== undefined) {
      props.invoice = prisma.invoice
        ? InvoiceEntity.fromPrisma(prisma.invoice)
        : null;
    }

    if (prisma.user !== undefined || prisma.createdBy !== undefined) {
      props.user = prisma.user ?? prisma.createdBy ?? null;
    }
    if (prisma.department !== undefined) {
      props.department = prisma.department;
    }
    if (prisma.statusHistory) {
      props.statusHistory = prisma.statusHistory.map((row) => ({
        status: row.toStatus as OrderStatus,
        at: row.changedAt,
        estimated: row.estimated,
      }));
    }

    if (prisma.items) {
      props.items = prisma.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        productSizeId: item.productSizeId,
        comboId: item.comboId,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
        subtotal: Number(item.subtotal),
        modifiers: (item.modifiers ?? []).map((modifier) => ({
          id: modifier.id,
          modifierId: modifier.modifierId,
          priceAdjustment: Number(modifier.priceAdjustment),
          nameEs: modifier.modifier?.nameEs,
          nameEn: modifier.modifier?.nameEn ?? null,
        })),
        catalog:
          item.product !== undefined ||
          item.productSize !== undefined ||
          item.combo !== undefined
            ? {
                product: item.product ?? null,
                productSize: item.productSize ?? null,
                combo: item.combo ?? null,
              }
            : undefined,
      }));
    }

    return new OrderEntity(props);
  }

  toResponseDto(options?: {
    maskPrices?: boolean;
    now?: Date;
    /** T-38: idioma de nombres y descripciones de las líneas (default es). */
    lang?: Lang;
  }): OrderResponseDto {
    if (!this.props.id) {
      throw new Error("Cannot convert unpersisted entity to response DTO");
    }
    const maskPrices = options?.maskPrices ?? false;
    const lang = options?.lang ?? Lang.ES;
    const dto = new OrderResponseDto();
    dto.id = this.props.id;
    dto.userId = this.props.userId;
    dto.couponId = this.props.couponId;
    dto.companyId = this.props.companyId;
    dto.branchId = this.props.branchId;
    dto.departmentId = this.props.departmentId;
    dto.createdById = this.props.createdById;
    dto.deliveryAddressId = this.props.deliveryAddressId;
    dto.deliveryDate = this.props.deliveryDate;
    dto.deliveryTime = this.props.deliveryTime;
    dto.notes = this.props.notes;
    dto.priority = this.props.priority;
    dto.status = this.props.status;
    dto.statusGroup = getOrderStatusGroup(this.props.status);
    dto.subtotal = maskPrices ? null : this.props.subtotal;
    dto.discount = maskPrices ? null : this.props.discount;
    dto.tax = maskPrices ? null : this.props.tax;
    dto.shipping = maskPrices ? null : this.props.shipping;
    dto.taxRate = maskPrices ? null : this.props.taxRate;
    dto.total = maskPrices ? null : this.props.total;
    dto.diners = this.diners;
    dto.user = this.props.user ?? null;
    dto.department = this.props.department ?? null;
    if (this.props.statusHistory) {
      dto.statusHistory = this.props.statusHistory.map((entry) => {
        const entryDto = new OrderStatusHistoryEntryDto();
        entryDto.status = entry.status;
        entryDto.statusGroup = getOrderStatusGroup(entry.status);
        entryDto.at = entry.at;
        entryDto.estimated = entry.estimated;
        return entryDto;
      });
    }
    dto.orderNumber = this.props.orderNumber;
    dto.receiverName = this.props.receiverName;
    dto.receiverPhone = this.props.receiverPhone;
    dto.addressDetail = this.props.addressDetail;
    dto.addressReference = this.props.addressReference;
    dto.createdAt = this.props.createdAt;
    dto.updatedAt = this.props.updatedAt;
    // OPERATOR (maskPrices) no ve facturación.
    dto.invoice =
      maskPrices || !this.props.invoice
        ? null
        : this.props.invoice.toSummaryDto(options?.now);

    if (this.props.items) {
      dto.items = this.props.items.map((item) => {
        if (!item.id) {
          throw new Error(
            "Cannot convert unpersisted order item to response DTO",
          );
        }
        const itemDto = new OrderItemResponseDto();
        itemDto.id = item.id;
        itemDto.productId = item.productId;
        itemDto.productSizeId = item.productSizeId;
        itemDto.comboId = item.comboId;
        itemDto.quantity = item.quantity;
        itemDto.unitPrice = maskPrices ? null : item.unitPrice;
        itemDto.subtotal = maskPrices ? null : item.subtotal;
        Object.assign(itemDto, describeOrderLine(item, lang));
        itemDto.modifiers = item.modifiers.map((modifier) => {
          if (!modifier.id) {
            throw new Error(
              "Cannot convert unpersisted order item modifier to response DTO",
            );
          }
          const modDto = new OrderItemModifierResponseDto();
          modDto.id = modifier.id;
          modDto.modifierId = modifier.modifierId;
          modDto.name = modifier.nameEs
            ? localizedText(lang, modifier.nameEs, modifier.nameEn ?? null)
            : "Extra";
          modDto.priceAdjustment = maskPrices ? null : modifier.priceAdjustment;
          return modDto;
        });
        return itemDto;
      });
    }

    return dto;
  }
}
