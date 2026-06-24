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

//  home Routes
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
    const productData={
      ...req.body,
      approvalStatus:"pending",
      createdAt: new Date(),
    }
    const db = client.db("resell_hub_db");
    const productsCollection = db.collection("products");

    const result = await productsCollection.insertOne(productData);

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




// buyer order routes
app.get("/api/orders/buyer/:buyerId", async (req, res) => {
  try {
    const db = client.db("resell_hub_db");
    const ordersCollection = db.collection("orders");

    const { buyerId } = req.params;

    const orders = await ordersCollection
      .find({ "buyerInfo.userId": buyerId })
      .sort({ createdAt: -1 })
      .toArray();

    res.status(200).json({ success: true, count: orders.length, data: orders });
  } catch (err) {
    console.error("Failed to fetch buyer orders:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});





// Add a product to wishlist
app.post("/api/wishlist", async (req, res) => {
  try {
    const db = client.db("resell_hub_db");
    const wishlistCollection = db.collection("wishlists");

    const { userId, productId } = req.body;

    if (!ObjectId.isValid(productId)) {
      return res.status(400).json({ success: false, message: "Invalid product id" });
    }

    // Avoid duplicate entries for the same user + product
    const existing = await wishlistCollection.findOne({ userId, productId });
    if (existing) {
      return res.status(200).json({ success: true, message: "Already in wishlist" });
    }

    await wishlistCollection.insertOne({
      userId,
      productId,
      addedAt: new Date(),
    });

    res.status(201).json({ success: true, message: "Added to wishlist" });
  } catch (err) {
    console.error("Failed to add to wishlist:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Remove a product from wishlist
app.delete("/api/wishlist/:userId/:productId", async (req, res) => {
  try {
    const db = client.db("resell_hub_db");
    const wishlistCollection = db.collection("wishlists");

    const { userId, productId } = req.params;

    await wishlistCollection.deleteOne({ userId, productId });

    res.status(200).json({ success: true, message: "Removed from wishlist" });
  } catch (err) {
    console.error("Failed to remove from wishlist:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Get all wishlist items for a user, joined with live product data
app.get("/api/wishlist/:userId", async (req, res) => {
  try {
    const db = client.db("resell_hub_db");
    const wishlistCollection = db.collection("wishlists");

    const { userId } = req.params;

    const wishlist = await wishlistCollection
      .aggregate([
        { $match: { userId } },
        {
          $addFields: {
            productObjId: { $toObjectId: "$productId" },
          },
        },
        {
          $lookup: {
            from: "products",
            localField: "productObjId",
            foreignField: "_id",
            as: "product",
          },
        },
        { $unwind: "$product" },
        { $sort: { addedAt: -1 } },
      ])
      .toArray();

    res.status(200).json({ success: true, count: wishlist.length, data: wishlist });
  } catch (err) {
    console.error("Failed to fetch wishlist:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});





// All review routes
app.post("/api/reviews", async (req, res) => {
  try {
    const db = client.db("resell_hub_db");
    const reviewsCollection = db.collection("reviews");
    const ordersCollection = db.collection("orders");

    const { reviewerInfo, productId, rating, comment } = req.body;

    if (!reviewerInfo?.userId || !productId) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, message: "Rating must be between 1 and 5" });
    }

    // Verified purchase check
    // TODO: once Stripe is live, add { paymentStatus: "paid" } to this filter
    const hasPurchased = await ordersCollection.findOne({
      "buyerInfo.userId": reviewerInfo.userId,
      productId,
    });

    if (!hasPurchased) {
      return res.status(403).json({
        success: false,
        message: "Only buyers who have ordered this product can leave a review",
      });
    }

    // One review per user per product
    const existingReview = await reviewsCollection.findOne({
      "reviewerInfo.userId": reviewerInfo.userId,
      productId,
    });

    if (existingReview) {
      return res.status(409).json({
        success: false,
        message: "You've already reviewed this product",
      });
    }

    const review = {
      reviewerInfo,
      productId,
      rating,
      comment,
      createdAt: new Date(),
    };

    const result = await reviewsCollection.insertOne(review);

    res.status(201).json({ success: true, data: { ...review, _id: result.insertedId } });
  } catch (err) {
    console.error("Failed to create review:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});




// get review by id 
app.get("/api/reviews/:productId", async (req, res) => {
  try {
    const db = client.db("resell_hub_db");
    const reviewsCollection = db.collection("reviews");

    const { productId } = req.params;

    const reviews = await reviewsCollection
      .find({ productId })
      .sort({ createdAt: -1 })
      .toArray();

    const averageRating =
      reviews.length > 0
        ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
        : 0;

    res.status(200).json({
      success: true,
      count: reviews.length,
      averageRating: Number(averageRating.toFixed(1)),
      data: reviews,
    });
  } catch (err) {
    console.error("Failed to fetch reviews:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});




// fetch the orders by seller id
app.get("/api/orders/seller/:sellerId", async (req, res) => {
  try {
    const db = client.db("resell_hub_db");
    const ordersCollection = db.collection("orders");

    const { sellerId } = req.params;

    const orders = await ordersCollection
      .find({ "sellerInfo.seller_id": sellerId })
      .sort({ createdAt: -1 })
      .toArray();

    res.status(200).json({ success: true, count: orders.length, data: orders });
  } catch (err) {
    console.error("Failed to fetch seller orders:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});






const VALID_STATUSES = ["pending", "accepted", "rejected", "processing", "shipped", "delivered"];

// Defines which statuses are allowed to move to which next status
const ALLOWED_TRANSITIONS = {
  pending: ["accepted", "rejected"],
  accepted: ["processing"],
  processing: ["shipped"],
  shipped: ["delivered"],
  rejected: [],
  delivered: [],
};

app.patch("/api/orders/:id/status", async (req, res) => {
  try {
    const db = client.db("resell_hub_db");
    const ordersCollection = db.collection("orders");

    const { id } = req.params;
    const { status, sellerId } = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid order id" });
    }

    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid status value" });
    }

    const order = await ordersCollection.findOne({ _id: new ObjectId(id) });

    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    // Only the seller who owns this order can update it
    if (order.sellerInfo?.seller_id !== sellerId) {
      return res.status(403).json({ success: false, message: "Not authorized to update this order" });
    }

    const allowedNext = ALLOWED_TRANSITIONS[order.orderStatus] || [];

    if (!allowedNext.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot move order from "${order.orderStatus}" to "${status}"`,
      });
    }

    await ordersCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { orderStatus: status, updatedAt: new Date() } }
    );

    res.status(200).json({ success: true, message: `Order marked as ${status}` });
  } catch (err) {
    console.error("Failed to update order status:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});





// Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
