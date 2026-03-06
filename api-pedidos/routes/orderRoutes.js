const express = require('express');
const router = express.Router();
const pool = require('../db');

/**
 * @swagger
 * components:
 *   schemas:
 *     OrderInput:
 *       type: object
 *       required:
 *         - numeroPedido
 *         - valorTotal
 *         - dataCriacao
 *         - items
 *       properties:
 *         numeroPedido:
 *           type: string
 *           example: "v10089015vdb-01"
 *         valorTotal:
 *           type: number
 *           example: 10000
 *         dataCriacao:
 *           type: string
 *           format: date-time
 *           example: "2023-07-19T12:24:11.5299601+00:00"
 *         items:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               idItem:
 *                 type: string
 *                 example: "2434"
 *               quantidadeItem:
 *                 type: integer
 *                 example: 1
 *               valorItem:
 *                 type: number
 *                 example: 1000
 *     Order:
 *       type: object
 *       properties:
 *         orderId:
 *           type: string
 *         value:
 *           type: number
 *         creationDate:
 *           type: string
 *           format: date-time
 *         items:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               productId:
 *                 type: integer
 *               quantity:
 *                 type: integer
 *               price:
 *                 type: number
 */

// Maps the input JSON fields to the database column format
function mapOrder(body) {
    return {
        orderId: body.numeroPedido,
        value: body.valorTotal,
        creationDate: new Date(body.dataCriacao).toISOString(),
        items: body.items.map(item => ({
            productId: parseInt(item.idItem),
            quantity: item.quantidadeItem,
            price: item.valorItem
        }))
    };
}

/**
 * @swagger
 * /order:
 *   post:
 *     summary: Create a new order
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/OrderInput'
 *     responses:
 *       201:
 *         description: Order created successfully
 *       400:
 *         description: Invalid data
 *       500:
 *         description: Internal server error
 */
router.post('/', async (req, res) => {
    const client = await pool.connect();

    try {
        const order = mapOrder(req.body);

        await client.query('BEGIN');

        await client.query(
            'INSERT INTO "Order" ("orderId", "value", "creationDate") VALUES ($1, $2, $3)',
            [order.orderId, order.value, order.creationDate]
        );

        for (const item of order.items) {
            await client.query(
                'INSERT INTO "Items" ("orderId", "productId", "quantity", "price") VALUES ($1, $2, $3, $4)',
                [order.orderId, item.productId, item.quantity, item.price]
            );
        }

        await client.query('COMMIT');

        res.status(201).json({ message: 'Order created successfully.', order });
    } catch (error) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: 'Failed to create order.', detail: error.message });
    } finally {
        client.release();
    }
});

/**
 * @swagger
 * /order/list:
 *   get:
 *     summary: List all orders
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of orders
 *       500:
 *         description: Internal server error
 */
router.get('/list', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT o."orderId", o."value", o."creationDate",
                    COALESCE(json_agg(json_build_object(
                        'productId', i."productId",
                        'quantity', i."quantity",
                        'price', i."price"
                    )) FILTER (WHERE i."productId" IS NOT NULL), '[]') AS items
             FROM "Order" o
             LEFT JOIN "Items" i ON o."orderId" = i."orderId"
             GROUP BY o."orderId", o."value", o."creationDate"
             ORDER BY o."creationDate" DESC`
        );

        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Failed to list orders.', detail: error.message });
    }
});

/**
 * @swagger
 * /order/{orderId}:
 *   get:
 *     summary: Get order by ID
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Order data
 *       404:
 *         description: Order not found
 *       500:
 *         description: Internal server error
 */
router.get('/:orderId', async (req, res) => {
    try {
        const { orderId } = req.params;

        const result = await pool.query(
            `SELECT o."orderId", o."value", o."creationDate",
                    COALESCE(json_agg(json_build_object(
                        'productId', i."productId",
                        'quantity', i."quantity",
                        'price', i."price"
                    )) FILTER (WHERE i."productId" IS NOT NULL), '[]') AS items
             FROM "Order" o
             LEFT JOIN "Items" i ON o."orderId" = i."orderId"
             WHERE o."orderId" = $1
             GROUP BY o."orderId", o."value", o."creationDate"`,
            [orderId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Order not found.' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch order.', detail: error.message });
    }
});

/**
 * @swagger
 * /order/{orderId}:
 *   put:
 *     summary: Update order by ID
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/OrderInput'
 *     responses:
 *       200:
 *         description: Order updated successfully
 *       404:
 *         description: Order not found
 *       500:
 *         description: Internal server error
 */
router.put('/:orderId', async (req, res) => {
    const client = await pool.connect();

    try {
        const { orderId } = req.params;
        const order = mapOrder(req.body);

        await client.query('BEGIN');

        const exists = await client.query('SELECT 1 FROM "Order" WHERE "orderId" = $1', [orderId]);

        if (exists.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Order not found.' });
        }

        await client.query(
            'UPDATE "Order" SET "value" = $1, "creationDate" = $2 WHERE "orderId" = $3',
            [order.value, order.creationDate, orderId]
        );

        await client.query('DELETE FROM "Items" WHERE "orderId" = $1', [orderId]);

        for (const item of order.items) {
            await client.query(
                'INSERT INTO "Items" ("orderId", "productId", "quantity", "price") VALUES ($1, $2, $3, $4)',
                [orderId, item.productId, item.quantity, item.price]
            );
        }

        await client.query('COMMIT');

        res.json({ message: 'Order updated successfully.', order });
    } catch (error) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: 'Failed to update order.', detail: error.message });
    } finally {
        client.release();
    }
});

/**
 * @swagger
 * /order/{orderId}:
 *   delete:
 *     summary: Delete order by ID
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Order deleted successfully
 *       404:
 *         description: Order not found
 *       500:
 *         description: Internal server error
 */
router.delete('/:orderId', async (req, res) => {
    try {
        const { orderId } = req.params;

        const result = await pool.query('DELETE FROM "Order" WHERE "orderId" = $1 RETURNING *', [orderId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Order not found.' });
        }

        res.json({ message: 'Order deleted successfully.' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete order.', detail: error.message });
    }
});

module.exports = router;
