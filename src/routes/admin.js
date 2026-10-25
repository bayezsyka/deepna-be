const express = require('express');
const db = require('../db');
const authenticateToken = require('../middleware/auth');

const router = express.Router();

// Semua route di sini diproteksi dengan JWT token
router.use(authenticateToken);

// GET /api/admin/products
router.get('/products', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        ci.id,
        ci.section_id,
        cs.label AS section_label,
        ci.name,
        ci.price_text,
        ci.sort_order,
        ci.updated_at
      FROM catalog_items ci
      JOIN catalog_sections cs ON ci.section_id = cs.id
      ORDER BY cs.sort_order ASC, ci.sort_order ASC, ci.id ASC
    `);

    return res.json(
      result.rows.map((row) => ({
        id: row.id,
        sectionId: row.section_id,
        sectionLabel: row.section_label,
        name: row.name,
        priceText: row.price_text,
        sortOrder: row.sort_order,
        updatedAt: row.updated_at,
      }))
    );
  } catch (err) {
    console.error('Error fetching admin products:', err);
    return res.status(500).json({ error: 'Gagal mengambil daftar produk.' });
  }
});

// GET /api/admin/products/:id
router.get('/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query(
      `SELECT ci.id, ci.section_id, cs.label AS section_label, ci.name, ci.price_text, ci.updated_at
       FROM catalog_items ci
       JOIN catalog_sections cs ON ci.section_id = cs.id
       WHERE ci.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Produk tidak ditemukan.' });
    }

    const row = result.rows[0];
    return res.json({
      id: row.id,
      sectionId: row.section_id,
      sectionLabel: row.section_label,
      name: row.name,
      priceText: row.price_text,
      updatedAt: row.updated_at,
    });
  } catch (err) {
    console.error('Error fetching product by id:', err);
    return res.status(500).json({ error: 'Gagal mengambil detail produk.' });
  }
});

// PUT /api/admin/products/:id
// Update harga produk (dan opsional nama produk)
router.put('/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { priceText, name } = req.body;

    if (priceText === undefined) {
      return res.status(400).json({ error: 'Field priceText wajib disertakan.' });
    }

    const existing = await db.query('SELECT * FROM catalog_items WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Produk tidak ditemukan.' });
    }

    const finalName = name !== undefined ? name.trim() : existing.rows[0].name;

    const updateRes = await db.query(
      `UPDATE catalog_items
       SET price_text = $1, name = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING id, section_id, name, price_text, updated_at`,
      [priceText, finalName, id]
    );

    const updated = updateRes.rows[0];
    return res.json({
      success: true,
      message: `Harga untuk ${updated.name} berhasil diperbarui.`,
      product: {
        id: updated.id,
        sectionId: updated.section_id,
        name: updated.name,
        priceText: updated.price_text,
        updatedAt: updated.updated_at,
      },
    });
  } catch (err) {
    console.error('Error updating product price:', err);
    return res.status(500).json({ error: 'Gagal memperbarui harga produk.' });
  }
});

module.exports = router;
