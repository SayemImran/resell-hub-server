const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(
  cors({
    origin: "http://localhost:3000",
    credentials: true,
  }),
);
app.use(express.json());

const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function connectDB() {
  try {
    await client.connect();
    console.log("Connected to MongoDB!");
  } catch (error) {
    console.error("MongoDB connection error:", error);
  }
}

connectDB();

// Routes
app.get("/", (req, res) => {
  res.json({ message: "Welcome to Resell Dokan Server!" });
});

// get all products
app.get("/api/products", async (req, res) => {
  try {
    const db = client.db("resell_hub_db");
    const productsCollection = db.collection("products");

    // Fetch all products and convert the MongoDB cursor to an array
    const products = await productsCollection.find({}).toArray();

    res.status(200).json({
      success: true,
      count: products.length,
      data: products,
    });
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch products",
      error: error.message,
    });
  }
});

// get the specific item
app.get("/api/products/:id", async (req, res) => {
  try {
    const db = client.db("resell_hub_db");
    const productsCollection = db.collection("products");

    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid product id" });
    }

    const product = await productsCollection.findOne({ _id: new ObjectId(id) });

    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    res.status(200).json({ success: true, data: product });
  } catch (err) {
    console.error("Failed to fetch product:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// post or upload products
app.post("/api/product/add", async (req, res) => {
  try {
    const data = req.body;
    const db = client.db("resell_hub_db");
    const productsCollection = db.collection("products");

    const result = await productsCollection.insertOne(data);

    res.status(201).json({
      success: true,
      message: "Product added successfully",
      insertedId: result.insertedId,
    });
  } catch (error) {
    console.error("Error adding product:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});


// update the target product
app.patch("/api/products/edit/:id", async (req, res) => {
  try {
    const db = client.db("resell_hub_db");
    const productsCollection = db.collection("products");

    const { id } = req.params;
    const updates = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid product id" });
    }

    // Never let the client overwrite these fields directly
    delete updates._id;
    delete updates.seller_info;

    const result = await productsCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updates }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    res.status(200).json({ success: true, message: "Product updated" });
  } catch (err) {
    console.error("Failed to update product:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});



// order routes

app.post("/api/orders", async (req, res) => {
  try {
    const db = client.db("resell_hub_db");
    const ordersCollection = db.collection("orders");
    const productsCollection = db.collection("products");

    const { buyerInfo, productId, quantity } = req.body;

    if (!ObjectId.isValid(productId)) {
      return res.status(400).json({ success: false, message: "Invalid product id" });
    }

    const product = await productsCollection.findOne({ _id: new ObjectId(productId) });

    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    if (product.seller_info?.seller_id === buyerInfo?.userId) {
      return res.status(403).json({ success: false, message: "You cannot order your own product" });
    }

    if (quantity < 1 || product.stock < quantity) {
      return res.status(400).json({ success: false, message: "Not enough stock available" });
    }

    const order = {
      buyerInfo,
      sellerInfo: product.seller_info,
      productId,
      productTitle: product.title,
      productImage: product.imageUrl,
      price: product.price,
      quantity,
      totalAmount: product.price * quantity,
      paymentStatus: "pending", // TODO: replace once Stripe webhook confirms real payment
      orderStatus: "processing",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await ordersCollection.insertOne(order);

    await productsCollection.updateOne(
      { _id: new ObjectId(productId) },
      { $inc: { stock: -quantity } }
    );

    res.status(201).json({ success: true, data: { ...order, _id: result.insertedId } });
  } catch (err) {
    console.error("Failed to create order:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});


// Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
