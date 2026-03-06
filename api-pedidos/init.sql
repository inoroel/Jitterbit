CREATE TABLE IF NOT EXISTS "Order" (
    "orderId"      VARCHAR(50) PRIMARY KEY,
    "value"        NUMERIC(12,2) NOT NULL,
    "creationDate" TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS "Items" (
    "orderId"    VARCHAR(50) REFERENCES "Order"("orderId") ON DELETE CASCADE,
    "productId"  INTEGER NOT NULL,
    "quantity"   INTEGER NOT NULL,
    "price"      NUMERIC(12,2) NOT NULL,
    PRIMARY KEY ("orderId", "productId")
);
