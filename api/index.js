// Vercel Serverless Function for Wave-Connect Signaling
// This uses HTTP polling instead of WebSocket due to Vercel limitations

// In-memory storage (Note: Resets on cold starts - use Redis for production)
const rooms = new Map();

// Helper to generate room ID
function generateRoomId() {
  return Math.random().toString(36).substring(2, 7).toUpperCase();
}

// Clean rooms older than 1 hour
function cleanOldRooms() {
  const oneHourAgo = Date.now() - 3600000;
  for (const [roomId, room] of rooms.entries()) {
    if (room.lastActivity < oneHourAgo) {
      rooms.delete(roomId);
    }
  }
}

// Main Vercel serverless handler
module.exports = async (req, res) => {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const { method, url } = req;
  const path = url.split("?")[0];

  try {
    // Periodic cleanup
    if (Math.random() < 0.1) cleanOldRooms();

    // POST /api/create-room
    if (method === "POST" && path === "/api/create-room") {
      const { username } = req.body;
      const roomId = generateRoomId();

      rooms.set(roomId, {
        creator: { username: username || "Anonymous", callType: null },
        peer: null,
        messages: [],
        lastActivity: Date.now(),
      });

      return res.status(200).json({ type: "room_created", roomId });
    }

    // POST /api/join-room
    if (method === "POST" && path === "/api/join-room") {
      const { roomId, username } = req.body;
      const room = rooms.get(roomId);

      if (!room) {
        return res.status(404).json({ type: "error", error: "Room not found" });
      }

      if (room.peer) {
        return res.status(403).json({ type: "room_full" });
      }

      room.peer = { username: username || "Anonymous" };
      room.lastActivity = Date.now();

      // Notify creator
      room.messages.push({
        type: "peer_joined",
        username: username,
      });

      return res.status(200).json({
        type: "room_joined",
        roomId,
        callType: room.creator.callType,
        peerUsername: room.creator.username,
      });
    }

    // POST /api/signal
    if (method === "POST" && path === "/api/signal") {
      const { roomId, signal } = req.body;
      const room = rooms.get(roomId);

      if (!room) {
        return res.status(404).json({ type: "error", error: "Room not found" });
      }

      room.messages.push(signal);
      room.lastActivity = Date.now();

      // Update call type if selected
      if (signal.type === "call_type_selected") {
        room.creator.callType = signal.callType;
      }

      return res.status(200).json({ success: true });
    }

    // GET /api/poll/:roomId
    if (method === "GET" && path.startsWith("/api/poll/")) {
      const roomId = path.split("/").pop();
      const room = rooms.get(roomId);

      if (!room) {
        return res.status(404).json({ type: "error", error: "Room not found" });
      }

      const messages = [...room.messages];
      room.messages = [];
      room.lastActivity = Date.now();

      return res.status(200).json({ messages });
    }

    // POST /api/leave-room
    if (method === "POST" && path === "/api/leave-room") {
      const { roomId } = req.body;
      const room = rooms.get(roomId);

      if (room) {
        room.messages.push({ type: "peer_left" });
        setTimeout(() => rooms.delete(roomId), 5000);
      }

      return res.status(200).json({ success: true });
    }

    return res.status(404).json({ error: "Not found" });
  } catch (error) {
    console.error("API Error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};
