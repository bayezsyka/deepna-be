const express = require('express');
const db = require('../db');

const router = express.Router();

// GET /api/catalog
router.get('/', async (req, res) => {
  try {
    const sectionsRes = await db.query(
      'SELECT id, label, sort_order FROM catalog_sections ORDER BY sort_order ASC'
    );
    const itemsRes = await db.query(
      'SELECT id, section_id, name, price_text, sort_order FROM catalog_items ORDER BY sort_order ASC, id ASC'
    );

    const itemsBySection = {};
    for (const item of itemsRes.rows) {
      if (!itemsBySection[item.section_id]) {
        itemsBySection[item.section_id] = [];
      }
      itemsBySection[item.section_id].push({
        id: item.id,
        name: item.name,
        priceText: item.price_text,
      });
    }

    const catalog = sectionsRes.rows.map((sec) => ({
      id: sec.id,
      label: sec.label,
      items: itemsBySection[sec.id] || [],
    }));

    return res.json(catalog);
  } catch (err) {
    console.error('Error fetching catalog:', err);
    return res.status(500).json({ error: 'Gagal memuat katalog dari database.' });
  }
});

module.exports = router;
