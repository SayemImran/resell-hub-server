const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const app = express();
const PORT = process.env.PORT || 5000;
const { verifyJWT, requireRole } = require("./middlewere/auth.js");



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
    const { approvalStatus, sellerId, limit } = req.query;

    const filter = {};
    if (approvalStatus) filter.approvalStatus = approvalStatus;
    if (sellerId) filter["seller_info.seller_id"] = sellerId;

    let query = productsCollection.find(filter).sort({ createdAt: -1 });
    if (limit) query = query.limit(Number(limit));

    const products = await query.toArray();
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
app.post("/api/product/add",verifyJWT, requireRole("Seller","Admin"),async (req, res) => {
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
app.patch("/api/products/edit/:id", verifyJWT, requireRole("Seller", "Admin"),async (req, res) => {
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



// buyer order routes
app.get("/api/orders/buyer/:buyerId",verifyJWT, async (req, res) => {
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

// fetch the orders by seller id
app.get("/api/orders/seller/:sellerId", verifyJWT,async (req, res) => {
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




// Add a product to wishlist
app.post("/api/wishlist",verifyJWT, async (req, res) => {
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
app.delete("/api/wishlist/:userId/:productId", verifyJWT, async (req, res) => {
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
app.get("/api/wishlist/:userId",verifyJWT, async (req, res) => {
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
app.post("/api/reviews",verifyJWT, async (req, res) => {
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

app.patch("/api/orders/:id/status", verifyJWT, requireRole("Seller", "Admin"), async (req, res) => {
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



// Get all pending products for admin review
app.get("/api/admin/products/pending", verifyJWT, requireRole("Admin"),async (req, res) => {
  try {
    const db = client.db("resell_hub_db");
    const productsCollection = db.collection("products");

    const products = await productsCollection
      .find({ approvalStatus: "pending" })
      .sort({ createdAt: -1 })
      .toArray();

    res.status(200).json({ success: true, count: products.length, data: products });
  } catch (err) {
    console.error("Failed to fetch pending products:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Approve or reject a product
app.patch("/api/admin/products/:id/approval", verifyJWT, requireRole("Admin"),async (req, res) => {
  try {
    const db = client.db("resell_hub_db");
    const productsCollection = db.collection("products");

    const { id } = req.params;
    const { approvalStatus } = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid product id" });
    }

    if (!["approved", "rejected"].includes(approvalStatus)) {
      return res.status(400).json({ success: false, message: "Invalid approval status" });
    }

    const result = await productsCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { approvalStatus, updatedAt: new Date() } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    res.status(200).json({ success: true, message: `Product ${approvalStatus}` });
  } catch (err) {
    console.error("Failed to update approval status:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});


// Add an item to cart (or increase quantity if already there)
app.post("/api/cart", verifyJWT,async (req, res) => {
  try {
    const db = client.db("resell_hub_db");
    const cartCollection = db.collection("carts");
    const productsCollection = db.collection("products");

    const { userId, productId, quantity } = req.body;

    if (!ObjectId.isValid(productId)) {
      return res.status(400).json({ success: false, message: "Invalid product id" });
    }

    const product = await productsCollection.findOne({ _id: new ObjectId(productId) });

    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    if (product.seller_info?.seller_id === userId) {
      return res.status(403).json({ success: false, message: "You cannot add your own product to cart" });
    }

    let cart = await cartCollection.findOne({ userId });

    if (!cart) {
      cart = { userId, items: [], createdAt: new Date(), updatedAt: new Date() };
    }

    const existingItem = cart.items.find((item) => item.productId === productId);

    if (existingItem) {
      existingItem.quantity = Math.min(existingItem.quantity + quantity, product.stock);
    } else {
      cart.items.push({ productId, quantity: Math.min(quantity, product.stock) });
    }

    cart.updatedAt = new Date();

    await cartCollection.updateOne(
      { userId },
      { $set: cart },
      { upsert: true }
    );

    res.status(200).json({ success: true, message: "Added to cart" });
  } catch (err) {
    console.error("Failed to add to cart:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Get cart contents, joined with live product data
app.get("/api/cart/:userId",verifyJWT, async (req, res) => {
  try {
    const db = client.db("resell_hub_db");
    const cartCollection = db.collection("carts");
    const productsCollection = db.collection("products");

    const { userId } = req.params;

    const cart = await cartCollection.findOne({ userId });

    if (!cart || cart.items.length === 0) {
      return res.status(200).json({ success: true, data: [] });
    }

    const productIds = cart.items.map((item) => new ObjectId(item.productId));
    const products = await productsCollection.find({ _id: { $in: productIds } }).toArray();

    const enrichedItems = cart.items.map((item) => {
      const product = products.find((p) => p._id.toString() === item.productId);
      return {
        productId: item.productId,
        quantity: item.quantity,
        product, // full product details (title, price, imageUrl, stock, seller_info, etc.)
      };
    }).filter((item) => item.product); // drop items whose product was deleted

    res.status(200).json({ success: true, data: enrichedItems });
  } catch (err) {
    console.error("Failed to fetch cart:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Update quantity of a specific item
app.patch("/api/cart/:userId/:productId",verifyJWT, async (req, res) => {
  try {
    const db = client.db("resell_hub_db");
    const cartCollection = db.collection("carts");

    const { userId, productId } = req.params;
    const { quantity } = req.body;

    if (quantity < 1) {
      return res.status(400).json({ success: false, message: "Quantity must be at least 1" });
    }

    await cartCollection.updateOne(
      { userId, "items.productId": productId },
      { $set: { "items.$.quantity": quantity, updatedAt: new Date() } }
    );

    res.status(200).json({ success: true, message: "Cart updated" });
  } catch (err) {
    console.error("Failed to update cart:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Remove an item from cart
app.delete("/api/cart/:userId/:productId", async (req, res) => {
  try {
    const db = client.db("resell_hub_db");
    const cartCollection = db.collection("carts");

    const { userId, productId } = req.params;

    await cartCollection.updateOne(
      { userId },
      { $pull: { items: { productId } }, $set: { updatedAt: new Date() } }
    );

    res.status(200).json({ success: true, message: "Removed from cart" });
  } catch (err) {
    console.error("Failed to remove from cart:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Clear entire cart (used after successful checkout)
app.delete("/api/cart/:userId",verifyJWT, async (req, res) => {
  try {
    const db = client.db("resell_hub_db");
    const cartCollection = db.collection("carts");

    const { userId } = req.params;

    await cartCollection.updateOne(
      { userId },
      { $set: { items: [], updatedAt: new Date() } }
    );

    res.status(200).json({ success: true, message: "Cart cleared" });
  } catch (err) {
    console.error("Failed to clear cart:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});


// checkout applied here
app.post("/api/orders/checkout", verifyJWT, async (req, res) => {
  try {
    const db = client.db("resell_hub_db");
    const ordersCollection = db.collection("orders");
    const productsCollection = db.collection("products");
    const cartCollection = db.collection("carts");

    const { buyerInfo, items, deliveryInfo } = req.body;
    // items: [{ productId, quantity }, ...]

    if (!items || items.length === 0) {
      return res.status(400).json({ success: false, message: "Cart is empty" });
    }

    const checkoutGroupId = new ObjectId().toString(); // links all orders from this single checkout
    const createdOrders = [];

    for (const item of items) {
      if (!ObjectId.isValid(item.productId)) continue;

      const product = await productsCollection.findOne({ _id: new ObjectId(item.productId) });

      if (!product) continue;

      if (product.seller_info?.seller_id === buyerInfo.userId) {
        return res.status(403).json({
          success: false,
          message: `You cannot order your own product: ${product.title}`,
        });
      }

      if (product.stock < item.quantity) {
        return res.status(400).json({
          success: false,
          message: `Not enough stock for "${product.title}"`,
        });
      }

      const order = {
        buyerInfo,
        sellerInfo: product.seller_info,
        productId: item.productId,
        productTitle: product.title,
        productImage: product.imageUrl,
        price: product.price,
        quantity: item.quantity,
        totalAmount: product.price * item.quantity,
        deliveryInfo,
        checkoutGroupId,
        paymentStatus: "pending",
        orderStatus: "processing",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await ordersCollection.insertOne(order);
      createdOrders.push({ ...order, _id: result.insertedId.toString() });
    }

    if (createdOrders.length === 0) {
      return res.status(400).json({ success: false, message: "No valid items to order" });
    }

    res.status(201).json({ success: true, checkoutGroupId, data: createdOrders });
  } catch (err) {
    console.error("Failed to create checkout orders:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Confirm payment for an entire checkout group (called from success page)
app.patch("/api/orders/checkout/:checkoutGroupId/confirm-payment", async (req, res) => {
  try {
    const db = client.db("resell_hub_db");
    const ordersCollection = db.collection("orders");
    const productsCollection = db.collection("products");
    const transactionsCollection = db.collection("transactions");

    const { checkoutGroupId } = req.params;
    const { paymentIntentId, paymentMethod } = req.body;

    const orders = await ordersCollection.find({ checkoutGroupId }).toArray();

    if (orders.length === 0) {
      return res.status(404).json({ success: false, message: "No orders found for this checkout" });
    }

    if (orders[0].paymentStatus === "paid") {
      return res.status(200).json({ success: true, message: "Already confirmed" });
    }

    await ordersCollection.updateMany(
      { checkoutGroupId },
      { $set: { paymentStatus: "paid", paymentIntentId, updatedAt: new Date() } }
    );

    for (const order of orders) {
      await productsCollection.updateOne(
        { _id: new ObjectId(order.productId) },
        { $inc: { stock: -order.quantity } }
      );
    }

    const totalAmount = orders.reduce((sum, o) => sum + o.totalAmount, 0);

    await transactionsCollection.insertOne({
      transactionId: paymentIntentId,
      buyerId: orders[0].buyerInfo.userId,
      orderIds: orders.map((o) => o._id.toString()),
      checkoutGroupId,
      amount: totalAmount,
      paymentStatus: "paid",
      paymentMethod: paymentMethod || "card",
      paymentDate: new Date(),
    });

    res.status(200).json({ success: true, message: "Payment confirmed" });
  } catch (err) {
    console.error("Failed to confirm checkout payment:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});


// admin stuffs here
app.get("/api/admin/stats", verifyJWT, requireRole("Admin"),async (req, res) => {
  try {
    const db = client.db("resell_hub_db");

    const usersCollection = db.collection("user"); // better-auth's default collection
    const productsCollection = db.collection("products");
    const ordersCollection = db.collection("orders");

    const [totalUsers, totalProducts, totalOrders] = await Promise.all([
      usersCollection.countDocuments(),
      productsCollection.countDocuments(),
      ordersCollection.countDocuments(),
    ]);

    res.status(200).json({
      success: true,
      data: { totalUsers, totalProducts, totalOrders },
    });
  } catch (err) {
    console.error("Failed to fetch admin stats:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});
// View all users
app.get("/api/admin/users",verifyJWT, requireRole("Admin"), async (req, res) => {
  try {
    const db = client.db("resell_hub_db");
    const usersCollection = db.collection("user");

    const users = await usersCollection
      .find({}, { projection: { password: 0 } }) // never return password hashes
      .sort({ createdAt: -1 })
      .toArray();

    res.status(200).json({ success: true, count: users.length, data: users });
  } catch (err) {
    console.error("Failed to fetch users:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Update account status (block/unblock)
app.patch("/api/admin/users/:id/status",verifyJWT, requireRole("Admin"), async (req, res) => {
  try {
    const db = client.db("resell_hub_db");
    const usersCollection = db.collection("user");

    const { id } = req.params;
    const { accountStatus } = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid user id" });
    }

    if (!["active", "blocked"].includes(accountStatus)) {
      return res.status(400).json({ success: false, message: "Invalid status value" });
    }

    const result = await usersCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { accountStatus, updatedAt: new Date() } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    res.status(200).json({ success: true, message: `User ${accountStatus}` });
  } catch (err) {
    console.error("Failed to update user status:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Delete user account
app.delete("/api/admin/users/:id",verifyJWT, requireRole("Admin"), async (req, res) => {
  try {
    const db = client.db("resell_hub_db");
    const usersCollection = db.collection("user");

    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid user id" });
    }

    const result = await usersCollection.deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    res.status(200).json({ success: true, message: "User deleted" });
  } catch (err) {
    console.error("Failed to delete user:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});


//  Homepage needed routes.
// Homepage: latest approved products
app.get("/api/home/featured-products", async (req, res) => {
  try {
    const db = client.db("resell_hub_db");
    const productsCollection = db.collection("products");

    const products = await productsCollection
      .find({ approvalStatus: "approved" })
      .sort({ createdAt: -1 })
      .limit(6)
      .toArray();

    res.status(200).json({ success: true, data: products });
  } catch (err) {
    console.error("Failed to fetch featured products:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Homepage: product count per category
app.get("/api/home/category-counts", async (req, res) => {
  try {
    const db = client.db("resell_hub_db");
    const productsCollection = db.collection("products");

    const counts = await productsCollection
      .aggregate([
        { $match: { approvalStatus: "approved" } },
        { $group: { _id: "$category", count: { $sum: 1 } } },
      ])
      .toArray();

    res.status(200).json({ success: true, data: counts });
  } catch (err) {
    console.error("Failed to fetch category counts:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Homepage: marketplace-wide stats
app.get("/api/home/stats", async (req, res) => {
  try {
    const db = client.db("resell_hub_db");
    const usersCollection = db.collection("user");
    const productsCollection = db.collection("products");
    const ordersCollection = db.collection("orders");

    const [totalProducts, totalSellers, totalBuyers, completedOrders] = await Promise.all([
      productsCollection.countDocuments({ approvalStatus: "approved" }),
      usersCollection.countDocuments({ role: "Seller" }),
      usersCollection.countDocuments({ role: "Buyer" }),
      ordersCollection.countDocuments({ orderStatus: "delivered" }),
    ]);

    res.status(200).json({
      success: true,
      data: { totalProducts, totalSellers, totalBuyers, completedOrders },
    });
  } catch (err) {
    console.error("Failed to fetch homepage stats:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Homepage: top sellers by completed sales
app.get("/api/home/trusted-sellers", async (req, res) => {
  try {
    const db = client.db("resell_hub_db");
    const ordersCollection = db.collection("orders");

    const topSellers = await ordersCollection
      .aggregate([
        { $match: { orderStatus: "delivered" } },
        {
          $group: {
            _id: "$sellerInfo.seller_id",
            name: { $first: "$sellerInfo.name" },
            email: { $first: "$sellerInfo.email" },
            completedSales: { $sum: 1 },
          },
        },
        { $sort: { completedSales: -1 } },
        { $limit: 5 },
        {
          $addFields: {
            sellerObjId: { $toObjectId: "$_id" },
          },
        },
        {
          $lookup: {
            from: "user",
            localField: "sellerObjId",
            foreignField: "_id",
            as: "userDoc",
          },
        },
        {
          $addFields: {
            imageUrl: { $arrayElemAt: ["$userDoc.imageUrl", 0] },
          },
        },
        { $project: { userDoc: 0, sellerObjId: 0 } },
      ])
      .toArray();

    res.status(200).json({ success: true, data: topSellers });
  } catch (err) {
    console.error("Failed to fetch trusted sellers:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});


// Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
