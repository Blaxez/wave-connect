const express = require("express");
const path = require("path");

const app = express();

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// In-memory storage for rooms (Note: This resets on each serverless invocation)
// For production, use a database like Redis or Supabase
const rooms = new Map();

// Helper function to generate room ID
function generateRoomId() {
  return Math.random().toString(36).substring(2, 7).toUpperCase();
}

// API Routes for signaling (HTTP-based fallback)
app.post("/api/create-room", (req, res) => {
  const { username } = req.body;
  const roomId = generateRoomId();

  rooms.set(roomId, {
    creator: { username: username || "Anonymous", callType: null },
    peer: null,
    messages: [],
  });

  res.json({ type: "room_created", roomId });
});

app.post("/api/join-room", (req, res) => {
  const { roomId, username } = req.body;
  const room = rooms.get(roomId);

  if (!room) {
    return res.status(404).json({ type: "error", error: "Room not found" });
  }

  if (room.peer) {
    return res.status(403).json({ type: "room_full" });
  }

  room.peer = { username: username || "Anonymous" };

  res.json({
    type: "room_joined",
    roomId,
    callType: room.creator.callType,
    peerUsername: room.creator.username,
  });
});

app.post("/api/signal", (req, res) => {
  const { roomId, signal } = req.body;
  const room = rooms.get(roomId);

  if (!room) {
    return res.status(404).json({ type: "error", error: "Room not found" });
  }

  // Store the signal message
  room.messages.push(signal);

  res.json({ success: true });
});

app.get("/api/poll/:roomId", (req, res) => {
  const { roomId } = req.params;
  const room = rooms.get(roomId);

  if (!room) {
    return res.status(404).json({ type: "error", error: "Room not found" });
  }

  // Return pending messages and clear them
  const messages = [...room.messages];
  room.messages = [];

  res.json({ messages });
});

// Serve index.html for all other routes
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Export for Vercel serverless
module.exports = app;

// Local development server
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(
      `🚀 Wave-Connect HTTP server running on http://localhost:${PORT}`
    );
    console.log(`📡 Using HTTP polling for signaling (Vercel-compatible)`);
  });
}
