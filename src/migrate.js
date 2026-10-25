require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('./db');
const initialCatalog = require('./initial-catalog');

async function migrate() {
  console.log('--- Memulai Migrasi & Seeding Neon Database ---');

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Table users
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. Table catalog_sections
    await client.query(`
      CREATE TABLE IF NOT EXISTS catalog_sections (
        id VARCHAR(50) PRIMARY KEY,
        label VARCHAR(100) NOT NULL,
        sort_order INT NOT NULL DEFAULT 0
      );
    `);

    // 3. Table catalog_items
    await client.query(`
      CREATE TABLE IF NOT EXISTS catalog_items (
        id SERIAL PRIMARY KEY,
        section_id VARCHAR(50) NOT NULL REFERENCES catalog_sections(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        price_text TEXT NOT NULL,
        sort_order INT NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 4. Seed Admin User
    const adminUser = process.env.ADMIN_USERNAME || 'username';
    const adminPass = process.env.ADMIN_PASSWORD || 'password';
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(adminPass, salt);

    const userRes = await client.query('SELECT id FROM users WHERE username = $1', [adminUser]);
    if (userRes.rows.length === 0) {
      await client.query(
        'INSERT INTO users (username, password_hash) VALUES ($1, $2)',
        [adminUser, hash]
      );
      console.log(`User admin '${adminUser}' berhasil dibuat.`);
    } else {
      // Pastikan password sesuai .env jika sudah ada
      await client.query(
        'UPDATE users SET password_hash = $1 WHERE username = $2',
        [hash, adminUser]
      );
      console.log(`Password admin '${adminUser}' diperbarui.`);
    }

    // 5. Seed Sections & Items
    for (let sIndex = 0; sIndex < initialCatalog.length; sIndex++) {
      const section = initialCatalog[sIndex];
      await client.query(
        `INSERT INTO catalog_sections (id, label, sort_order)
         VALUES ($1, $2, $3)
         ON CONFLICT (id) DO UPDATE SET label = EXCLUDED.label, sort_order = EXCLUDED.sort_order`,
        [section.id, section.label, sIndex]
      );

      for (let iIndex = 0; iIndex < section.items.length; iIndex++) {
        const item = section.items[iIndex];
        const existing = await client.query(
          'SELECT id FROM catalog_items WHERE section_id = $1 AND LOWER(TRIM(name)) = LOWER(TRIM($2))',
          [section.id, item.name]
        );

        if (existing.rows.length === 0) {
          await client.query(
            `INSERT INTO catalog_items (section_id, name, price_text, sort_order)
             VALUES ($1, $2, $3, $4)`,
            [section.id, item.name, item.priceText, iIndex]
          );
        }
      }
    }

    await client.query('COMMIT');
    console.log('Migrasi & Seeding berhasil diselesaikan!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migrasi gagal:', err);
    process.exit(1);
  } finally {
    client.release();
    await db.pool.end();
  }
}

if (require.main === module) {
  migrate();
}

module.exports = migrate;
