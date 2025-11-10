const WebSocket = require("ws");
const os = require("os");
const express = require("express");
const path = require("path");
const fs = require("fs");
const https = require("https");

const PORT = 8080;
const PING_INTERVAL = 30000; // 30 seconds - keep connections alive
const app = express();

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, "public")));

// Read SSL certificate and key
const privateKey = fs.readFileSync("key.pem", "utf8");
const certificate = fs.readFileSync("cert.pem", "utf8");
const credentials = { key: privateKey, cert: certificate };

// Create HTTPS server and attach WebSocket server to it
const server = https.createServer(credentials, app);
const wss = new WebSocket.Server({ server });

const rooms = {}; // Store room information

// Get local IP address
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      const { address, family, internal } = iface;
      if (family === "IPv4" && !internal) {
        return address;
      }
    }
  }
  return "localhost";
}

const localIP = getLocalIP();
server.listen(PORT, () => {
  console.log(`Server running at https://${localIP}:${PORT}`);
  console.log(`Local access: https://localhost:${PORT}`);
  console.log(`WebSocket server running on wss://${localIP}:${PORT}`);
  console.log(`Local WebSocket access: wss://localhost:${PORT}`);
  console.log("\n⚠️  Note: You may see a security warning in your browser.");
  console.log("   This is normal for self-signed certificates.");
  console.log('   Click "Advanced" and "Proceed" to continue.');
});

wss.on("connection", (ws) => {
  console.log("Client connected. Total connections:", wss.clients.size);

  // Mark connection as alive
  ws.isAlive = true;

  // Handle pong responses
  ws.on("pong", () => {
    ws.isAlive = true;
  });

  ws.on("message", (message) => {
    let data;
    try {
      data = JSON.parse(message);
    } catch (e) {
      console.error("Invalid JSON received:", message);
      return;
    }

    console.log("Received message:", data.type, "in room:", data.roomId);

    switch (data.type) {
      case "create_room": {
        const roomId = generateRoomId();
        rooms[roomId] = [ws];
        ws.roomId = roomId; // Associate ws with the room
        ws.username = data.username || "Anonymous"; // Store username
        ws.callType = null; // Will be set when call starts
        ws.send(
          JSON.stringify({
            type: "room_created",
            roomId,
          })
        );
        console.log(
          `Room ${roomId} created by ${ws.username}. Waiting for peer to join.`
        );
        break;
      }
      case "join_room": {
        const roomId = data.roomId;
        if (rooms[roomId] && rooms[roomId].length < 2) {
          rooms[roomId].push(ws);
          ws.roomId = roomId;
          ws.username = data.username || "Anonymous"; // Store username

          // Get the call type from the room creator (if they've started a call)
          const roomCreator = rooms[roomId][0];
          const callType = roomCreator.callType || null;

          // Notify the OTHER peer (creator) that someone joined - include username
          broadcast(roomId, ws, {
            type: "peer_joined",
            username: ws.username,
          });

          // Notify the joining peer with room info and call type
          ws.send(
            JSON.stringify({
              type: "room_joined",
              roomId: roomId,
              callType: callType, // Send the active call type
              peerUsername: roomCreator.username,
            })
          );

          console.log(
            `${ws.username} joined room ${roomId}. Call type: ${
              callType || "not started"
            }. Room now has ${rooms[roomId].length} peer(s).`
          );
        } else if (rooms[roomId] && rooms[roomId].length >= 2) {
          ws.send(
            JSON.stringify({
              type: "room_full",
            })
          );
          console.log(`Room ${roomId} is full. Rejecting join request.`);
        } else {
          ws.send(
            JSON.stringify({
              type: "error",
              error: "Room not found",
            })
          );
          console.log(`Join attempt failed: Room ${roomId} does not exist.`);
        }
        break;
      }
      case "offer":
      case "answer":
      case "candidate":
      case "screen_share_started":
      case "screen_share_stopped":
      case "camera_switched": {
        // Include username in signaling messages
        const messageWithUsername = { ...data, username: ws.username };
        broadcast(data.roomId, ws, messageWithUsername);
        break;
      }
      case "call_type_selected": {
        // Store the call type when a user starts the call
        ws.callType = data.callType; // 'audio' or 'video'
        console.log(
          `${ws.username} selected ${data.callType} call in room ${data.roomId}`
        );

        // Notify the other peer about the call type
        broadcast(data.roomId, ws, {
          type: "call_type_notification",
          callType: data.callType,
          username: ws.username,
        });
        break;
      }
      case "ready": {
        // When a peer is ready, check if other peer is in room and notify
        const roomId = data.roomId;
        if (rooms[roomId] && rooms[roomId].length === 2) {
          console.log(
            `Both peers ready in room ${roomId}. Initiating signaling.`
          );
          // Notify the sender that peer is already in the room
          ws.send(
            JSON.stringify({
              type: "peer_ready",
            })
          );
        }
        break;
      }
      case "leave_room": {
        leaveRoom(ws);
        break;
      }
      default:
        console.warn("Unknown message type:", data.type);
    }
  });

  ws.on("close", () => {
    console.log("Client disconnected. Total connections:", wss.clients.size);
    leaveRoom(ws);
  });

  ws.on("error", (error) => {
    console.error("WebSocket error:", error);
    leaveRoom(ws);
  });
});

function broadcast(roomId, sender, message) {
  if (!rooms[roomId]) return;
  rooms[roomId].forEach((client) => {
    if (client !== sender && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
}

function leaveRoom(ws) {
  const roomId = ws.roomId;
  if (!roomId || !rooms[roomId]) return;

  // Remove the client from the room
  rooms[roomId] = rooms[roomId].filter((client) => client !== ws);

  // Notify the other peer
  broadcast(roomId, ws, { type: "peer_left" });
  console.log(`Client left room ${roomId}`);

  // If the room is now empty, delete it
  if (rooms[roomId].length === 0) {
    delete rooms[roomId];
    console.log(`Room ${roomId} is now empty and has been deleted.`);
  }
}

function generateRoomId() {
  // Generate a simple 5-digit code
  return Math.random().toString(36).substring(2, 7).toUpperCase();
}

// WebSocket keep-alive ping/pong
const pingInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      console.log("Terminating inactive connection");
      return ws.terminate();
    }

    ws.isAlive = false;
    ws.ping();
  });
}, PING_INTERVAL);
