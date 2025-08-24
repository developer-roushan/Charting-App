const express = require("express");
const path = require("path");
const session = require("express-session");
const chartRoutes = require("./routes/chart.routes");
const chartService = require("./services/chart.service");

const app = express();
const PORT = process.env.PORT || 3000;
require("dotenv").config();
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: "yourSecretKey",
    resave: false,
    saveUninitialized: true,
    cookie: {
      maxAge: 5 * 60 * 1000,
    },
    rolling: true, 
  })
);
app.use(express.static(path.join(__dirname, "public")));
app.use("/api/chart", chartRoutes);
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "views/index.html"));
});
app.get("/logout", (req, res) => {
  req.session.destroy((err) => {
    res.redirect("/");
  });
});
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
app.get("/chart", (req, res) => {
  if (req.session.loggedIn) {
    res.sendFile(path.join(__dirname, "views/public/chart.html"));
  } else {
    res.redirect("/");
  }
});
app.get("/realtime", (req, res) => {
  if (req.session.loggedIn) {
    res.sendFile(path.join(__dirname, "views/public/realtime.html"));
  } else {
    res.redirect("/");
  }
});
app.listen(PORT,'0.0.0.0', () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
