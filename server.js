require("dotenv").config();
const express = require("express");
const session = require("express-session");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
if (!process.env.DATABASE_URL) console.warn("DATABASE_URL is not set. Add PostgreSQL connection string before starting.");
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("localhost") ? { rejectUnauthorized: false } : false,
  max: 5
});

const seedProducts = [
  ["RH-WLT-001","Classic საფულე","Classic Wallet","Classic кошелёк","ხელნაკეთი ნატურალური ტყავის საფულე.","Handmade genuine leather wallet.","Кошелёк ручной работы из натуральной кожи.","wallets",120,45,12,"https://images.unsplash.com/photo-1627123424574-724758594e93?auto=format&fit=crop&w=900&q=85"],
  ["RH-BAG-001","Helena ჩანთა","Helena Bag","Сумка Helena","ხელნაკეთი ტყავის ჩანთა.","Handmade leather bag.","Сумка ручной работы из кожи.","bags",280,115,5,"https://images.unsplash.com/photo-1594223274512-ad4803739b7c?auto=format&fit=crop&w=900&q=85"],
  ["RH-BEL-001","Vintage ქამარი","Vintage Belt","Ремень Vintage","გამძლე ტყავის ქამარი.","Durable leather belt.","Прочный кожаный ремень.","belts",90,32,20,"https://images.unsplash.com/photo-1624222247344-550fb60583dc?auto=format&fit=crop&w=900&q=85"],
  ["RH-ACC-001","გასაღების საკიდი","Key Holder","Брелок","პატარა ხელნაკეთი აქსესუარი.","Small handmade leather accessory.","Небольшой кожаный аксессуар.","accessories",30,8,30,"https://images.unsplash.com/photo-1611652022419-a9419f74343d?auto=format&fit=crop&w=900&q=85"]
];

async function initDb(){
  await pool.query(`
  CREATE TABLE IF NOT EXISTS admins (
    id SERIAL PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY, sku TEXT UNIQUE NOT NULL,
    name_ka TEXT NOT NULL, name_en TEXT NOT NULL, name_ru TEXT NOT NULL,
    desc_ka TEXT DEFAULT '', desc_en TEXT DEFAULT '', desc_ru TEXT DEFAULT '',
    category TEXT NOT NULL, price NUMERIC(12,2) NOT NULL, cost NUMERIC(12,2) NOT NULL DEFAULT 0,
    stock INTEGER NOT NULL DEFAULT 0, image TEXT DEFAULT '', active INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY, order_no TEXT UNIQUE NOT NULL,
    customer_name TEXT NOT NULL, phone TEXT NOT NULL, email TEXT DEFAULT '', city TEXT DEFAULT '', address TEXT DEFAULT '', note TEXT DEFAULT '',
    language TEXT DEFAULT 'ka', payment_method TEXT DEFAULT 'bank_transfer', status TEXT DEFAULT 'new',
    subtotal NUMERIC(12,2) NOT NULL, delivery NUMERIC(12,2) NOT NULL DEFAULT 0, total NUMERIC(12,2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS order_items (
    id SERIAL PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL, name TEXT NOT NULL, sku TEXT NOT NULL, qty INTEGER NOT NULL,
    price NUMERIC(12,2) NOT NULL, cost NUMERIC(12,2) NOT NULL
  );`);
  const adminEmail = process.env.ADMIN_EMAIL || "admin@redhelen.ge";
  const adminPassword = process.env.ADMIN_PASSWORD || "CHANGE_ME_NOW";
  const a = await pool.query("SELECT id FROM admins WHERE email=$1",[adminEmail]);
  if(!a.rowCount){ const hash=bcrypt.hashSync(adminPassword,12); await pool.query("INSERT INTO admins(email,password_hash) VALUES($1,$2)",[adminEmail,hash]); }
  const p = await pool.query("SELECT id FROM products LIMIT 1");
  if(!p.rowCount){
    for(const r of seedProducts) await pool.query(`INSERT INTO products(sku,name_ka,name_en,name_ru,desc_ka,desc_en,desc_ru,category,price,cost,stock,image) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT(sku) DO NOTHING`,r);
  }
}

app.use(express.json({limit:"1mb"}));
app.use(express.urlencoded({extended:true}));
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
app.use(express.static(path.join(__dirname,"public")));

function admin(req,res,next){ if(req.session.admin) return next(); res.status(401).json({error:"Unauthorized"}); }
function langField(lang,base){ return `${base}_${["ka","en","ru"].includes(lang)?lang:"ka"}`; }
async function orderNo(client){ const r=await client.query("SELECT COUNT(*)::int c FROM orders"); return `RH-${new Date().getFullYear()}-${String((r.rows[0].c||0)+1).padStart(4,"0")}`; }

app.get("/health",(req,res)=>res.json({ok:true,service:"RedHelen",db:!!process.env.DATABASE_URL}));
app.get("/api/products",async(req,res)=>{ try{const lang=req.query.lang||"ka",nf=langField(lang,"name"),df=langField(lang,"desc"); const r=await pool.query(`SELECT id,sku,${nf} name,${df} description,category,price,stock,image FROM products WHERE active=1 ORDER BY id DESC`); res.json(r.rows);}catch(e){res.status(500).json({error:e.message});}});
app.get("/api/products/:id",async(req,res)=>{try{const lang=req.query.lang||"ka",nf=langField(lang,"name"),df=langField(lang,"desc"); const r=await pool.query(`SELECT id,sku,${nf} name,${df} description,category,price,stock,image FROM products WHERE id=$1 AND active=1`,[req.params.id]); if(!r.rowCount)return res.status(404).json({error:"Not found"});res.json(r.rows[0]);}catch(e){res.status(500).json({error:e.message});}});

app.post("/api/orders",async(req,res)=>{
  const {customer_name,phone,email="",city="",address="",note="",language="ka",payment_method="bank_transfer",items=[]}=req.body;
  if(!customer_name||!phone||!Array.isArray(items)||!items.length)return res.status(400).json({error:"Missing order data"});
  const client=await pool.connect();
  try{
    await client.query("BEGIN"); let subtotal=0,clean=[];
    for(const it of items){const r=await client.query("SELECT * FROM products WHERE id=$1 AND active=1 FOR UPDATE",[Number(it.product_id)]); const p=r.rows[0]; const qty=Math.max(1,Math.floor(Number(it.qty)||1)); if(!p||p.stock<qty){await client.query("ROLLBACK");return res.status(400).json({error:`Product unavailable: ${it.product_id}`});} subtotal+=Number(p.price)*qty; clean.push({p,qty});}
    const delivery=subtotal>=150?0:10,total=subtotal+delivery,no=await orderNo(client);
    const o=await client.query(`INSERT INTO orders(order_no,customer_name,phone,email,city,address,note,language,payment_method,status,subtotal,delivery,total) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'new',$10,$11,$12) RETURNING id`,[no,customer_name,phone,email,city,address,note,language,payment_method,subtotal,delivery,total]);
    for(const x of clean){await client.query(`INSERT INTO order_items(order_id,product_id,name,sku,qty,price,cost) VALUES($1,$2,$3,$4,$5,$6,$7)`,[o.rows[0].id,x.p.id,x.p.name_ka,x.p.sku,x.qty,x.p.price,x.p.cost]);await client.query("UPDATE products SET stock=stock-$1 WHERE id=$2",[x.qty,x.p.id]);}
    await client.query("COMMIT"); res.json({ok:true,order_no:no,total});
  }catch(e){await client.query("ROLLBACK");res.status(500).json({error:e.message});}finally{client.release();}
});

app.post("/api/admin/login",async(req,res)=>{try{const {email,password}=req.body;const r=await pool.query("SELECT * FROM admins WHERE email=$1",[email]);const a=r.rows[0];if(!a||!bcrypt.compareSync(password,a.password_hash))return res.status(401).json({error:"Invalid login"});req.session.admin={id:a.id,email:a.email};res.json({ok:true});}catch(e){res.status(500).json({error:e.message});}});
app.post("/api/admin/logout",(req,res)=>req.session.destroy(()=>res.json({ok:true})));
app.get("/api/admin/me",admin,(req,res)=>res.json(req.session.admin));
app.get("/api/admin/dashboard",admin,async(req,res)=>{try{const s=await pool.query("SELECT COUNT(*)::int orders,COALESCE(SUM(total),0) revenue FROM orders"),p=await pool.query("SELECT COALESCE(SUM(oi.qty*(oi.price-oi.cost)),0) profit FROM order_items oi"),pr=await pool.query("SELECT COUNT(*)::int c FROM products WHERE active=1");res.json({...s.rows[0],...p.rows[0],products:pr.rows[0].c});}catch(e){res.status(500).json({error:e.message});}});
app.get("/api/admin/orders",admin,async(req,res)=>{try{const r=await pool.query("SELECT * FROM orders ORDER BY id DESC");for(const o of r.rows){const i=await pool.query("SELECT * FROM order_items WHERE order_id=$1 ORDER BY id",[o.id]);o.items=i.rows;}res.json(r.rows);}catch(e){res.status(500).json({error:e.message});}});
app.patch("/api/admin/orders/:id",admin,async(req,res)=>{const allowed=["new","confirmed","making","ready","shipped","completed","cancelled"];if(!allowed.includes(req.body.status))return res.status(400).json({error:"Bad status"});try{await pool.query("UPDATE orders SET status=$1 WHERE id=$2",[req.body.status,req.params.id]);res.json({ok:true});}catch(e){res.status(500).json({error:e.message});}});
app.get("/api/admin/products",admin,async(req,res)=>{try{res.json((await pool.query("SELECT * FROM products ORDER BY id DESC")).rows);}catch(e){res.status(500).json({error:e.message});}});
app.post("/api/admin/products",admin,async(req,res)=>{try{const p=req.body,r=await pool.query(`INSERT INTO products(sku,name_ka,name_en,name_ru,desc_ka,desc_en,desc_ru,category,price,cost,stock,image) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,[p.sku,p.name_ka,p.name_en,p.name_ru,p.desc_ka||"",p.desc_en||"",p.desc_ru||"",p.category,Number(p.price),Number(p.cost||0),Number(p.stock||0),p.image||""]);res.json({id:r.rows[0].id});}catch(e){res.status(400).json({error:e.message});}});
app.put("/api/admin/products/:id",admin,async(req,res)=>{try{const p=req.body;await pool.query(`UPDATE products SET sku=$1,name_ka=$2,name_en=$3,name_ru=$4,desc_ka=$5,desc_en=$6,desc_ru=$7,category=$8,price=$9,cost=$10,stock=$11,image=$12,active=$13 WHERE id=$14`,[p.sku,p.name_ka,p.name_en,p.name_ru,p.desc_ka||"",p.desc_en||"",p.desc_ru||"",p.category,Number(p.price),Number(p.cost||0),Number(p.stock||0),p.image||"",Number(p.active?1:0),req.params.id]);res.json({ok:true});}catch(e){res.status(400).json({error:e.message});}});
app.delete("/api/admin/products/:id",admin,async(req,res)=>{try{await pool.query("UPDATE products SET active=0 WHERE id=$1",[req.params.id]);res.json({ok:true});}catch(e){res.status(500).json({error:e.message});}});
app.get("/api/admin/export/orders.csv",admin,async(req,res)=>{try{const r=await pool.query("SELECT order_no,customer_name,phone,email,city,address,status,subtotal,delivery,total,created_at FROM orders ORDER BY id DESC");const head=["order_no","customer_name","phone","email","city","address","status","subtotal","delivery","total","created_at"];const esc=v=>`"${String(v??"").replaceAll('"','""')}"`;const csv="\uFEFF"+[head.join(","),...r.rows.map(x=>head.map(k=>esc(x[k])).join(","))].join("\n");res.setHeader("Content-Type","text/csv; charset=utf-8");res.setHeader("Content-Disposition","attachment; filename=redhelen-orders.csv");res.send(csv);}catch(e){res.status(500).send(e.message);}});

app.get("/admin/login",(req,res)=>res.sendFile(path.join(__dirname,"public","admin-login.html")));
app.get("/admin",(req,res)=>res.sendFile(path.join(__dirname,"public","admin.html")));

initDb().then(()=>app.listen(PORT,()=>console.log(`RedHelen running on port ${PORT}`))).catch(e=>{console.error(e);process.exit(1);});
