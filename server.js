const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// Static files
app.use(express.static(path.join(__dirname)));

// Products API
app.get('/api/products', (req, res) => {
  const products = [
    { id: 1, sku: 'RH-W01', name: 'ტყავის საფულე Classic', price: 85, description: 'ნატურალური ტყავის საფულე', image: 'https://images.unsplash.com/photo-1627123424574-724758594e93?auto=format&fit=crop&w=500&q=80' },
    { id: 2, sku: 'RH-B01', name: 'ტყავის ქამარი Premium', price: 95, description: 'ხელნაკეთი ტყავის ქამარი', image: 'https://images.unsplash.com/photo-1624222247344-550fb60583dc?auto=format&fit=crop&w=500&q=80' },
    { id: 3, sku: 'RH-H01', name: 'Glock 17/19 კაბურა', price: 120, description: 'ნატურალური ტყავის კაბურა', image: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=500&q=80' }
  ];
  res.json(products);
});

// Orders API
app.post('/api/orders', (req, res) => {
  const { customer_name, phone } = req.body;

  if (!customer_name || !phone) {
    return res.status(400).json({ error: "გთხოვთ მიუთითოთ სახელი და ტელეფონი" });
  }

  const orderNo = "RH-" + Math.floor(100000 + Math.random() * 900000);
  console.log("ახალი შეკვეთა:", req.body);

  res.status(200).json({
    success: true,
    order_no: orderNo,
    message: "შეკვეთა წარმატებით დარეგისტრირდა"
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
