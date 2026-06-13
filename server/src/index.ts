import { createServer } from "http";
import { Server } from "socket.io";

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: { origin: "http://localhost:3000" },
});

io.on("connection", (socket) => {
  console.log("client connected:", socket.id);
  socket.on("disconnect", () => console.log("client gone:", socket.id));
});

httpServer.listen(4000, () => console.log("ws server on :4000"));