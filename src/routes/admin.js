const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const authenticateToken = require('../middleware/auth');

const router = express.Router();

// Semua route di sini diproteksi dengan JWT token
router.use(authenticateToken);

// ==========================================
// 1. ADMIN PROFILE (GANTI USERNAME & PASSWORD)
// ==========================================

// PUT /api/admin/profile
router.put('/profile', async (req, res) => {
  try {
    const userId = req.user.id;
    const { currentPassword, newUsername, newPassword } = req.body;

    if (!currentPassword) {
      return res.status(400).json({ error: 'Password saat ini wajib diisi untuk verifikasi.' });
    }

    const userRes = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'Pengguna tidak ditemukan.' });
    }

    const user = userRes.rows[0];
    const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isMatch) {
      return res.status(400).json({ error: 'Password saat ini salah.' });
    }

    let updatedUsername = user.username;
    if (newUsername && newUsername.trim() !== '') {
      const cleanUsername = newUsername.trim();
      if (cleanUsername !== user.username) {
        // Cek apakah username baru sudah digunakan
        const checkUser = await db.query('SELECT id FROM users WHERE username = $1 AND id != $2', [
          cleanUsername,
          userId,
        ]);
        if (checkUser.rows.length > 0) {
          return res.status(400).json({ error: 'Username baru sudah digunakan.' });
        }
        updatedUsername = cleanUsername;
      }
    }

    let updatedHash = user.password_hash;
    if (newPassword && newPassword.trim() !== '') {
      if (newPassword.length < 4) {
        return res.status(400).json({ error: 'Password baru minimal 4 karakter.' });
      }
      const salt = await bcrypt.genSalt(10);
      updatedHash = await bcrypt.hash(newPassword, salt);
    }

    await db.query(
      'UPDATE users SET username = $1, password_hash = $2 WHERE id = $3',
      [updatedUsername, updatedHash, userId]
    );

    // Buat JWT token baru dengan username yang terupdate
    const jwtSecret = process.env.JWT_SECRET || 'deepna_secret_jwt_key_default';
    const newToken = jwt.sign(
      { id: user.id, username: updatedUsername },
      jwtSecret,
      { expiresIn: '7d' }
    );

    return res.json({
      success: true,
      message: 'Profil admin (username / password) berhasil diperbarui.',
      username: updatedUsername,
      token: newToken,
    });
  } catch (err) {
    console.error('Error updating admin profile:', err);
    return res.status(500).json({ error: 'Gagal memperbarui profil admin.' });
  }
});

// ==========================================
// 2. KATEGORI (SECTIONS) CRUD
// ==========================================

// GET /api/admin/sections
router.get('/sections', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        cs.id, 
        cs.label, 
        cs.sort_order, 
        COUNT(ci.id)::int AS item_count
      FROM catalog_sections cs
      LEFT JOIN catalog_items ci ON cs.id = ci.section_id
      GROUP BY cs.id, cs.label, cs.sort_order
      ORDER BY cs.sort_order ASC, cs.id ASC
    `);

    return res.json(
      result.rows.map((row) => ({
        id: row.id,
        label: row.label,
        sortOrder: row.sort_order,
        itemCount: row.item_count,
      }))
    );
  } catch (err) {
    console.error('Error fetching admin sections:', err);
    return res.status(500).json({ error: 'Gagal memuat kategori.' });
  }
});

// POST /api/admin/sections
router.post('/sections', async (req, res) => {
  try {
    const { id, label, sortOrder } = req.body;

    if (!label || label.trim() === '') {
      return res.status(400).json({ error: 'Nama label kategori wajib diisi.' });
    }

    // Generate slug id jika id tidak diberikan
    let sectionId = id ? id.trim().toLowerCase() : '';
    if (!sectionId) {
      sectionId = label
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    }

    // Cek apakah sectionId sudah ada
    const existing = await db.query('SELECT id FROM catalog_sections WHERE id = $1', [sectionId]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: `Kategori dengan ID '${sectionId}' sudah ada.` });
    }

    const finalSort = Number.isInteger(sortOrder) ? sortOrder : 0;

    await db.query(
      'INSERT INTO catalog_sections (id, label, sort_order) VALUES ($1, $2, $3)',
      [sectionId, label.trim(), finalSort]
    );

    return res.status(201).json({
      success: true,
      message: 'Kategori berhasil ditambahkan.',
      section: {
        id: sectionId,
        label: label.trim(),
        sortOrder: finalSort,
        itemCount: 0,
      },
    });
  } catch (err) {
    console.error('Error creating section:', err);
    return res.status(500).json({ error: 'Gagal menambahkan kategori.' });
  }
});

// PUT /api/admin/sections/:id
router.put('/sections/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { label, sortOrder } = req.body;

    const existing = await db.query('SELECT * FROM catalog_sections WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Kategori tidak ditemukan.' });
    }

    const current = existing.rows[0];
    const finalLabel = label !== undefined && label.trim() !== '' ? label.trim() : current.label;
    const finalSort = Number.isInteger(sortOrder) ? sortOrder : current.sort_order;

    await db.query(
      'UPDATE catalog_sections SET label = $1, sort_order = $2 WHERE id = $3',
      [finalLabel, finalSort, id]
    );

    return res.json({
      success: true,
      message: 'Kategori berhasil diperbarui.',
      section: {
        id,
        label: finalLabel,
        sortOrder: finalSort,
      },
    });
  } catch (err) {
    console.error('Error updating section:', err);
    return res.status(500).json({ error: 'Gagal memperbarui kategori.' });
  }
});

// DELETE /api/admin/sections/:id
router.delete('/sections/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await db.query('SELECT * FROM catalog_sections WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Kategori tidak ditemukan.' });
    }

    // Hapus section (catalog_items berelasi ON DELETE CASCADE)
    await db.query('DELETE FROM catalog_sections WHERE id = $1', [id]);

    return res.json({
      success: true,
      message: `Kategori '${existing.rows[0].label}' beserta aplikasinya berhasil dihapus.`,
    });
  } catch (err) {
    console.error('Error deleting section:', err);
    return res.status(500).json({ error: 'Gagal menghapus kategori.' });
  }
});

// ==========================================
// 3. APLIKASI PREMIUM (PRODUCTS) CRUD
// ==========================================

// GET /api/admin/products
router.get('/products', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        ci.id,
        ci.section_id,
        cs.label AS section_label,
        ci.name,
        ci.logo_url,
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
        logoUrl: row.logo_url || '',
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
      `SELECT ci.id, ci.section_id, cs.label AS section_label, ci.name, ci.logo_url, ci.price_text, ci.sort_order, ci.updated_at
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
      logoUrl: row.logo_url || '',
      priceText: row.price_text,
      sortOrder: row.sort_order,
      updatedAt: row.updated_at,
    });
  } catch (err) {
    console.error('Error fetching product by id:', err);
    return res.status(500).json({ error: 'Gagal mengambil detail produk.' });
  }
});

// POST /api/admin/products (Tambah Aplikasi Baru)
router.post('/products', async (req, res) => {
  try {
    const { sectionId, name, logoUrl, priceText, sortOrder } = req.body;

    if (!sectionId || !name || priceText === undefined) {
      return res.status(400).json({ error: 'Field sectionId, name, dan priceText wajib diisi.' });
    }

    // Pastikan sectionId valid
    const secCheck = await db.query('SELECT id FROM catalog_sections WHERE id = $1', [sectionId]);
    if (secCheck.rows.length === 0) {
      return res.status(400).json({ error: 'Kategori sectionId tidak valid.' });
    }

    const finalSort = Number.isInteger(sortOrder) ? sortOrder : 0;
    const finalLogo = logoUrl ? logoUrl.trim() : null;

    const insertRes = await db.query(
      `INSERT INTO catalog_items (section_id, name, logo_url, price_text, sort_order)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, section_id, name, logo_url, price_text, sort_order, updated_at`,
      [sectionId, name.trim(), finalLogo, priceText, finalSort]
    );

    const row = insertRes.rows[0];
    return res.status(201).json({
      success: true,
      message: `Aplikasi '${row.name}' berhasil ditambahkan.`,
      product: {
        id: row.id,
        sectionId: row.section_id,
        name: row.name,
        logoUrl: row.logo_url || '',
        priceText: row.price_text,
        sortOrder: row.sort_order,
        updatedAt: row.updated_at,
      },
    });
  } catch (err) {
    console.error('Error creating product:', err);
    return res.status(500).json({ error: 'Gagal menambahkan aplikasi baru.' });
  }
});

// PUT /api/admin/products/:id (Update Aplikasi + Logo + Harga)
router.put('/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { sectionId, name, logoUrl, priceText, sortOrder } = req.body;

    const existing = await db.query('SELECT * FROM catalog_items WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Produk tidak ditemukan.' });
    }

    const cur = existing.rows[0];

    let finalSectionId = cur.section_id;
    if (sectionId) {
      const secCheck = await db.query('SELECT id FROM catalog_sections WHERE id = $1', [sectionId]);
      if (secCheck.rows.length === 0) {
        return res.status(400).json({ error: 'Kategori sectionId tidak valid.' });
      }
      finalSectionId = sectionId;
    }

    const finalName = name !== undefined && name.trim() !== '' ? name.trim() : cur.name;
    const finalPriceText = priceText !== undefined ? priceText : cur.price_text;
    const finalLogoUrl = logoUrl !== undefined ? (logoUrl.trim() || null) : cur.logo_url;
    const finalSortOrder = Number.isInteger(sortOrder) ? sortOrder : cur.sort_order;

    const updateRes = await db.query(
      `UPDATE catalog_items
       SET section_id = $1, name = $2, logo_url = $3, price_text = $4, sort_order = $5, updated_at = CURRENT_TIMESTAMP
       WHERE id = $6
       RETURNING id, section_id, name, logo_url, price_text, sort_order, updated_at`,
      [finalSectionId, finalName, finalLogoUrl, finalPriceText, finalSortOrder, id]
    );

    const updated = updateRes.rows[0];
    return res.json({
      success: true,
      message: `Aplikasi '${updated.name}' berhasil diperbarui.`,
      product: {
        id: updated.id,
        sectionId: updated.section_id,
        name: updated.name,
        logoUrl: updated.logo_url || '',
        priceText: updated.price_text,
        sortOrder: updated.sort_order,
        updatedAt: updated.updated_at,
      },
    });
  } catch (err) {
    console.error('Error updating product:', err);
    return res.status(500).json({ error: 'Gagal memperbarui aplikasi.' });
  }
});

// DELETE /api/admin/products/:id (Hapus Aplikasi)
router.delete('/products/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await db.query('SELECT * FROM catalog_items WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Produk tidak ditemukan.' });
    }

    await db.query('DELETE FROM catalog_items WHERE id = $1', [id]);

    return res.json({
      success: true,
      message: `Aplikasi '${existing.rows[0].name}' berhasil dihapus.`,
    });
  } catch (err) {
    console.error('Error deleting product:', err);
    return res.status(500).json({ error: 'Gagal menghapus aplikasi.' });
  }
});

module.exports = router;
