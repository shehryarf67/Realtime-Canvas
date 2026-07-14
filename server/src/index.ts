import "dotenv/config";
import { createServer } from "http";
import express from "express";
import cookieParser from "cookie-parser";
import authRouter from "./routes/auth.js";
import boardsRouter from "./routes/boards.js";
import { connectToDatabase } from "./db.js";
import { initSocketServer } from "./socket.js";

const PORT = Number(process.env.PORT) || 4000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:3000";

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use((_req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", CLIENT_ORIGIN);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  next();
});
app.use("/auth", authRouter);
app.use("/boards", boardsRouter);

const httpServer = createServer(app);

initSocketServer(httpServer);

connectToDatabase()
  .then(() => {
    httpServer.listen(PORT, () => {
      console.log(`socket server listening on :${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Failed to connect to MongoDB:", err);
    process.exit(1);
  });
