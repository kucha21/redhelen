const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const { Pool } = require("pg");
const path = require("path");

const app = express();
const port = process.env.PORT || 3000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS admins (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      sku TEXT UNIQUE NOT NULL,
      name_ka TEXT NOT NULL,
      name_en TEXT NOT NULL,
      name_ru TEXT NOT NULL,
      desc_ka TEXT DEFAULT '',
      desc_en TEXT DEFAULT '',
      desc_ru TEXT DEFAULT '',
      price NUMERIC(12,2) NOT NULL,
      cost NUMERIC(12,2) NOT NULL DEFAULT 0,
      stock INTEGER NOT NULL DEFAULT 0,
      category TEXT DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      order_no TEXT UNIQUE NOT NULL,
      customer_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT DEFAULT '',
      city TEXT DEFAULT '',
      address TEXT DEFAULT '',
      language TEXT DEFAULT 'ka',
      payment_method TEXT DEFAULT 'bank_transfer',
      status TEXT DEFAULT 'new',
      total NUMERIC(12,2) NOT NULL,
      cost_total NUMERIC(12,2) NOT NULL DEFAULT 0,
      profit NUMERIC(12,2) NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS order_items (
      id SERIAL PRIMARY KEY,
      order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL,
      sku TEXT NOT NULL,
      name TEXT NOT NULL,
      qty INTEGER NOT NULL,
      price NUMERIC(12,2) NOT NULL,
      cost NUMERIC(12,2) NOT NULL
    );
  `);

  const adminEmail = process.env.ADMIN_EMAIL || "admin@redhelen.ge";
  const adminPassword = process.env.ADMIN_PASSWORD || "CHANGE_ME_NOW";
  const a = await pool.query("SELECT id FROM admins WHERE email=$1", [adminEmail]);
  if (!a.rowCount) {
    const hash = bcrypt.hashSync(adminPassword, 12);
    await pool.query("INSERT INTO admins(email,password_hash) VALUES($1,$2)", [adminEmail, hash]);
  }

  const p = await pool.query("SELECT COUNT(*)::int AS c FROM products");
  if (p.rows[0].c === 0) {
    await pool.query(`
      INSERT INTO products(sku,name_ka,name_en,name_ru,desc_ka,desc_en,desc_ru,category,price,cost,stock)
      VALUES
      ('W01','ტყავის საფულე','Leather Wallet','Кожаный кошелек','ხელით ნაკერი ტყავის საფულე','Handmade leather wallet','Кожаный кошелек ручной работы','wallets',120,45,10),
      ('H01','Glock 19 კაბურა','Glock 19 Holster','Кобура Glock 19','ტყავის კაბურა Glock 19-ისთვის','Leather holster for Glock 19','Кожаная кобура для Glock 19','holsters',150,55,8)
    `);
  }
}

initDb().catch(console.error);

app.set("trust proxy", 1);
app.use(session({
  secret: process.env.SESSION_SECRET || "CHANGE_ME_SESSION_SECRET",
  resave: false,
  saveUninitialized: false,
  proxy: true,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 8 * 60 * 60 * 1000
  }
}));

app.use(express.static(__dirname));

function requireAdmin(req, res, next) {
  if (!req.session || !req.session.adminId) return res.status(401).json({ error: "Unauthenticated" });
  next();
}

function langField(obj, field, lang) {
  const f = `${field}_${lang}`;
  return obj[f] || obj[`${field}_ka`] || obj[`${field}_en`] || "";
}

app.get("/api/health", async (req, res) => {
  const c = await pool.query("SELECT COUNT(*)::int AS c FROM orders");
  res.json({ ok: true, service: "RedHelen", dbConnected: true, orderCount: c.rows[0].c });
});

app.get("/api/products", async (req, res) => {
  const lang = req.query.lang || "ka";
  const r = await pool.query("SELECT * FROM products WHERE active=1 ORDER BY id DESC");
  const data = r.rows.map(p => ({
    id: p.id,
    sku: p.sku,
    name: langField(p, "name", lang),
    description: langField(p, "desc", lang),
    price: Number(p.price),
    category: p.category,
    stock: p.stock
  }));
  res.json(data);
});

app.post("/api/orders", async (req, res) => {
  const { customer_name, phone, email, city, address, language, payment_method, items } = req.body;
  if (!customer_name || !phone || !Array.isArray(items) || !items.length) {
    return res.status(400).json({ error: "Missing order data" });
  }
  let total = 0, costTotal = 0;
  const dbItems = [];
  for (const item of items) {
    const pr = await pool.query("SELECT * FROM products WHERE id=$1 AND active=1", [item.id]);
    if (!pr.rowCount) continue;
    const prod = pr.rows[0];
    const qty = Math.max(1, parseInt(item.qty, 10) || 1);
    const price = Number(prod.price);
    const cost = Number(prod.cost);
    total += price * qty;
    costTotal += cost * qty;
    dbItems.push({ product_id: prod.id, sku: prod.sku, name: langField(prod, "name", language || "ka"), qty, price, cost });
  }
  if (!dbItems.length) return res.status(400).json({ error: "No valid products in order" });
  const profit = total - costTotal;
  const orderNo = "RH-" + Math.floor(100000 + Math.random() * 900000);
  const ins = await pool.query(
    `INSERT INTO orders(order_no,customer_name,phone,email,city,address,language,payment_method,status,total,cost_total,profit)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,'new',$9,$10,$11) RETURNING id`,
    [orderNo, customer_name, phone, email || '', city || '', address || '', language || 'ka', payment_method || 'bank_transfer', total, costTotal, profit]
  );
  const orderId = ins.rows[0].id;
  for (const it of dbItems) {
    await pool.query(
      `INSERT INTO order_items(order_id,product_id,sku,name,qty,price,cost) VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [orderId, it.product_id, it.sku, it.qty, it.price, it.cost]
    );
  }
  res.json({ ok: true, order_no: orderNo });
});

app.post("/api/admin/login", async (req, res) => {
  const { email, password } = req.body;
  const r = await pool.query("SELECT * FROM admins WHERE email=$1", [email]);
  if (!r.rowCount) return res.status(401).json({ error: "Invalid credentials" });
  const admin = r.rows[0];
  if (!bcrypt.compareSync(password, admin.password_hash)) return res.status(401).json({ error: "Invalid credentials" });
  req.session.adminId = admin.id;
  res.json({ ok: true });
});

app.post("/api/admin/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get("/api/admin/me", requireAdmin, (req, res) => {
  res.json({ ok: true });
});

app.get("/api/admin/dashboard", requireAdmin, async (req, res) => {
  const orders = await pool.query("SELECT COUNT(*)::int AS total_orders, COALESCE(SUM(total),0) AS revenue, COALESCE(SUM(profit),0) AS profit FROM orders");
  const products = await pool.query("SELECT COUNT(*)::int AS total_products FROM products WHERE active=1");
  res.json({ orders: orders.rows[0], products: products.rows[0] });
});

app.get("/api/admin/orders", requireAdmin, async (req, res) => {
  const r = await pool.query("SELECT * FROM orders ORDER BY id DESC");
  res.json(r.rows);
});

app.get("/api/admin/orders/:id", requireAdmin, async (req, res) => {
  const o = await pool.query("SELECT * FROM orders WHERE id=$1", [req.params.id]);
  if (!o.rowCount) return res.status(404).json({ error: "Not found" });
  const items = await pool.query("SELECT * FROM order_items WHERE order_id=$1", [req.params.id]);
  res.json({ order: o.rows[0], items: items.rows });
});

app.patch("/api/admin/orders/:id", requireAdmin, async (req, res) => {
  const { status } = req.body;
  await pool.query("UPDATE orders SET status=$1 WHERE id=$2", [status, req.params.id]);
  res.json({ ok: true });
});

app.get("/api/admin/products", requireAdmin, async (req, res) => {
  const r = await pool.query("SELECT * FROM products ORDER BY id DESC");
  res.json(r.rows);
});

app.post("/api/admin/products", requireAdmin, async (req, res) => {
  const { sku, name_ka, name_en, name_ru, desc_ka, desc_en, desc_ru, price, cost, stock, category } = req.body;
  await pool.query(
    `INSERT INTO products(sku,name_ka,name_en,name_ru,desc_ka,desc_en,desc_ru,price,cost,stock,category)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [sku, name_ka, name_en || '', name_ru || '', desc_ka || '', desc_en || '', desc_ru || '', price, cost || 0, stock || 0, category || '']
  );
  res.json({ ok: true });
});

app.put("/api/admin/products/:id", requireAdmin, async (req, res) => {
  const { sku, name_ka, name_en, name_ru, desc_ka, desc_en, desc_ru, price, cost, stock, category, active } = req.body;
  await pool.query(
    `UPDATE products SET sku=$1,name_ka=$2,name_en=$3,name_ru=$4,desc_ka=$5,desc_en=$6,desc_ru=$7,price=$8,cost=$9,stock=$10,category=$11,active=$12 WHERE id=$13`,
    [sku, name_ka, name_en, name_ru, desc_ka, desc_en, desc_ru, price, cost, stock, category, active, req.params.id]
  );
  res.json({ ok: true });
});

app.get("/api/admin/export/orders.csv", requireAdmin, async (req, res) => {
  const r = await pool.query("SELECT order_no, customer_name, phone, total, profit, status, created_at FROM orders ORDER BY id DESC");
  let csv = "Order No,Customer,Phone,Total,Profit,Status,Date\n";
  for (const row of r.rows) {
    csv += `"${row.order_no}","${row.customer_name}","${row.phone}",${row.total},${row.profit},"${row.status}","${row.created_at}"\n`;
  }
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", 'attachment; filename="orders.csv"');
  res.send(csv);
});

app.get("/admin/login", (req, res) => {
  res.sendFile(path.join(__dirname, "admin-login.html"));
});

app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "admin.html"));
});

app.listen(port, () => {
  console.log(`RedHelen server running on port ${port}`);
});
     
