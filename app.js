const express = require("express");
const path = require("path");
const session = require("express-session");
const chartRoutes = require("./routes/chart.routes");
const chartService = require("./services/chart.service");

const app = express();
const PORT = process.env.PORT || 3000;
require("dotenv").config();

// Parse form data
app.use(express.urlencoded({ extended: true }));

// Session middleware
app.use(
  session({
    secret: "yourSecretKey",
    resave: false,
    saveUninitialized: true,
    cookie: {
      maxAge: 5 * 60 * 1000, // 5 minutes in milliseconds
    },
    rolling: true, // Reset maxAge on every response (activity)
  })
);

// Serve static files
app.use(express.static(path.join(__dirname, "public")));

// Chart routes (API)
app.use("/api/chart", chartRoutes);

// Login page
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "views/index.html"));
});
app.get("/logout", (req, res) => {
  req.session.destroy((err) => {
    res.redirect("/");
  });
});

// Handle login
app.post("/login", async (req, res) => {
  const { password } = req.body;
  if (password === process.env.PASSWORD) {
    req.session.loggedIn = true;
    const fs = require("fs");
    const tickerFilePath = path.join(__dirname, "../data/ticker.json");
    if (!fs.existsSync(tickerFilePath)) {
      await chartService.fetchTicker();
    }
    res.redirect("/chart");
  } else {
    res.send(
      '<script>alert("Invalid credentials!");window.location.href="/";</script>'
    );
  }
});

app.get("/api/chart/ticker", async (req, res) => {
  const data = await chartService.fetchTicker();
  res.json(data);
});

// Serve chart.html if logged in
app.get("/chart", (req, res) => {
  if (req.session.loggedIn) {
    res.sendFile(path.join(__dirname, "views/public/chart.html"));
  } else {
    res.redirect("/");
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
