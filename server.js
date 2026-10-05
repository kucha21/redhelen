const express = require("express");
const cors = require("cors");
const path = require("path");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// Products API
app.get("/api/products", async (req, res) => {
  try {
    const lang = req.query.lang || "ka";
    const result = await pool.query("SELECT * FROM products ORDER BY id ASC");
    
    const products = result.rows.map(p => ({
      id: p.id,
      sku: p.sku || `RH-${p.id}`,
      name: lang === "en" ? (p.name_en || p.name) : lang === "ru" ? (p.name_ru || p.name) : p.name,
      description: lang === "en" ? (p.description_en || p.description) : lang === "ru" ? (p.description_ru || p.description) : p.description,
      price: parseFloat(p.price) || 0,
      image: p.image || ""
    }));

    res.json(products);
  } catch (err) {
    console.error("Products Fetch Error:", err);
    res.status(500).json({ error: "Failed to fetch products" });
  }
});

// Orders API (Fixed validation)
app.post("/api/orders", async (req, res) => {
  try {
    const { customer_name, phone, email, city, address, note, language, payment_method, items } = req.body;

    // Validation: Require at least Name and Phone
    if (!customer_name || !phone) {
      return res.status(400).json({ error: "გთხოვთ მიუთითოთ სახელი და ტელეფონი / Please provide name and phone" });
    }

    const orderNo = "RH-" + Date.now().toString().slice(-6);
    const itemList = Array.isArray(items) && items.length > 0 ? JSON.stringify(items) : JSON.stringify([{ note: "Custom Order / ინდივიდუალური შეკვეთა" }]);

    // Insert order into Postgres DB
    const query = `
      INSERT INTO orders (order_no, customer_name, phone, email, city, address, note, language, payment_method, items, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
      RETURNING *;
    `;

    const values = [
      orderNo,
      customer_name,
      phone,
      email || "",
      city || "",
      address || "",
      note || "",
      language || "ka",
      payment_method || "cash",
      itemList
    ];

    await pool.query(query, values);

    res.json({ success: true, order_no: orderNo });
  } catch (err) {
    console.error("Order Creation Error:", err);
    res.status(500).json({ error: "Server Error: Could not save order" });
  }
});

// Serve Frontend
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
      
