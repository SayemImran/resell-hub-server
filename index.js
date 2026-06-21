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






// Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
