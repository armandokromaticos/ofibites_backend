-- T-38: detalle del pedido según el Figma.
--   1. orders.tax_rate: tasa de IVA congelada al crear el pedido ("IVA (16%)").
--      Backfill: 0.16 donde tax > 0 (pedidos del checkout); el resto queda en 0
--      (pedidos anteriores al checkout o de POST /orders, sin IVA).
--   2. order_status_history: una fila por transición de estado (y una CREATED
--      al crear el pedido), escrita por el back en la misma transacción.
--      Backfill de los pedidos existentes (las fechas intermedias no se pueden
--      recuperar):
--        a. una fila CREATED en created_at (exacta, estimated = false);
--        b. si el estado actual no es CREATED, una fila con ese estado en
--           updated_at (estimated = true: updated_at solo cambia con las
--           transiciones, pero no se puede garantizar).
--      Los pasos intermedios de esos pedidos quedan sin fecha.
--
-- Generado con prisma migrate diff y adaptado para poder re-ejecutarlo (IF NOT
-- EXISTS, FKs en un bloque DO, backfill solo de pedidos sin historial). El
-- repo no tiene historial de migraciones: aplicar a mano en Supabase con el
-- visto bueno del usuario (sin ella, toda lectura de pedidos da P2022/P2021):
--   npx prisma db execute --file prisma/migrations/20261117_pedido_detalle/migration.sql --schema prisma/schema.prisma
-- Después, comprobar:
--   SELECT count(*) FROM orders o WHERE NOT EXISTS (SELECT 1 FROM order_status_history h WHERE h.order_id = o.id);  -- 0
--   SELECT tax_rate, count(*) FROM orders GROUP BY tax_rate;
-- RLS: tabla nueva sin políticas (como invoices): la API pública de Supabase no
-- la ve; el back entra como dueño con BYPASSRLS.
BEGIN;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "tax_rate" DECIMAL(5,4) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE IF NOT EXISTS "order_status_history" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "from_status" "OrderStatus",
    "to_status" "OrderStatus" NOT NULL,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changed_by_id" TEXT,
    "estimated" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "order_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "order_status_history_order_id_changed_at_idx" ON "order_status_history"("order_id", "changed_at");
CREATE INDEX IF NOT EXISTS "order_status_history_changed_by_id_idx" ON "order_status_history"("changed_by_id");

-- AddForeignKey (Postgres no admite ADD CONSTRAINT IF NOT EXISTS)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_status_history_order_id_fkey' AND conrelid = '"order_status_history"'::regclass) THEN
    ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_status_history_changed_by_id_fkey' AND conrelid = '"order_status_history"'::regclass) THEN
    ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

-- Backfill 1: tasa de IVA de los pedidos existentes.
UPDATE "orders" SET "tax_rate" = 0.16 WHERE "tax" > 0 AND "tax_rate" = 0;

-- Backfill 2: historial de los pedidos que aún no tienen ninguna fila.
-- (a) CREATED en created_at, exacta.
INSERT INTO "order_status_history" ("id", "order_id", "from_status", "to_status", "changed_at", "changed_by_id", "estimated")
SELECT gen_random_uuid()::text, o."id", NULL, 'CREATED', o."created_at", o."created_by_id", false
FROM "orders" o
WHERE NOT EXISTS (SELECT 1 FROM "order_status_history" h WHERE h."order_id" = o."id");

-- (b) Estado actual en updated_at, estimada. Solo los pedidos cuya única fila
-- es la CREATED recién insertada (re-ejecutar no duplica).
INSERT INTO "order_status_history" ("id", "order_id", "from_status", "to_status", "changed_at", "changed_by_id", "estimated")
SELECT gen_random_uuid()::text, o."id", NULL, o."status", GREATEST(o."updated_at", o."created_at"), NULL, true
FROM "orders" o
WHERE o."status" <> 'CREATED'
  AND (SELECT count(*) FROM "order_status_history" h WHERE h."order_id" = o."id") = 1;

-- RLS sin políticas: cierra la tabla nueva a la API pública de Supabase.
ALTER TABLE "order_status_history" ENABLE ROW LEVEL SECURITY;

COMMIT;
