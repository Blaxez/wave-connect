// API Configuration for Vercel Backend
const API_CONFIG = {
  local: "http://localhost:3000",
  production: "https://your-vercel-app.vercel.app", // UPDATE THIS after deploying to Vercel
};

const isLocal =
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1";
const API_BASE = isLocal ? API_CONFIG.local : API_CONFIG.production;

let pollingInterval = null;
const POLL_INTERVAL = 1000; // Poll every 1 second

// UI Elements - New design
const welcomeScreen = document.getElementById("welcome-screen");
const callScreen = document.getElementById("call-screen");
const usernameInput = document.getElementById("username-input");
const roomInput = document.getElementById("room-input");
const joinRoomBtn = document.getElementById("join-room-btn");
const createRoomBtn = document.getElementById("create-room-btn");
const roomCodeDisplay = document.getElementById("room-code-display");
const roomCodeElement = document.getElementById("room-code");
const copyRoomBtn = document.getElementById("copy-room-btn");
const callTypeSelection = document.getElementById("call-type-selection");
const voiceCallBtn = document.getElementById("voice-call-btn");
const videoCallBtn = document.getElementById("video-call-btn");
const moreOptionsBtn = document.getElementById("more-options-btn");
const statusMessage = document.getElementById("status-message");
const peerAvatar = document.getElementById("peer-avatar");
const peerNameElement = document.getElementById("peer-name");
const callStatusElement = document.getElementById("call-status");
const localNameElement = document.getElementById("local-name");
const localVideo = document.getElementById("local-video");
const remoteVideo = document.getElementById("remote-video");
const toggleMicBtn = document.getElementById("toggle-mic-btn");
const toggleCameraBtn = document.getElementById("toggle-camera-btn");
const switchCameraBtn = document.getElementById("switch-camera-btn");
const shareScreenBtn = document.getElementById("share-screen-btn");
const stopShareScreenBtn = document.getElementById("stop-share-screen-btn");
const endCallBtn = document.getElementById("end-call-btn");
const micOnIcon = document.getElementById("mic-on-icon");
const micOffIcon = document.getElementById("mic-off-icon");
const cameraOnIcon = document.getElementById("camera-on-icon");
const cameraOffIcon = document.getElementById("camera-off-icon");
const themeToggle = document.getElementById("theme-toggle");
const sunIcon = document.getElementById("theme-icon-sun");
const moonIcon = document.getElementById("theme-icon-moon");

let localStream;
let remoteStream;
let peerConnection;
let roomId;
let isCaller = false;
let ws;
let screenStream = null;
let username = "";
let peerUsername = "";
let connectionQualityInterval = null;
let statsInterval = null;
let isLocalScreenSharing = false;
let isRemoteScreenSharing = false;
let originalLocalVideoTrack = null;

// Audio visualizer variables
let localAudioContext = null;
let localAnalyser = null;
let localDataArray = null;
let localAnimationId = null;
let remoteAudioContext = null;
let remoteAnalyser = null;
let remoteDataArray = null;
let remoteAnimationId = null;
let isAudioOnlyCall = false;

const stunServers = {
  iceServers: [
    {
      urls: [
        "stun:stun.l.google.com:19302",
        "stun:stun1.l.google.com:19302",
        "stun:stun2.l.google.com:19302",
        "stun:stun3.l.google.com:19302",
        "stun:stun4.l.google.com:19302",
      ],
    },
  ],
  iceCandidatePoolSize: 10,
  bundlePolicy: "max-bundle",
  rtcpMuxPolicy: "require",
};

// HTTP API functions (replacing WebSocket)
async function createRoomAPI() {
  try {
    const response = await fetch(`${API_BASE}/api/create-room`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username }),
    });
    const data = await response.json();
    handleAPIMessage(data);
    startPolling();
  } catch (error) {
    console.error("Error creating room:", error);
    updateStatus("Failed to create room. Please try again.");
  }
}

async function joinRoomAPI(roomCode) {
  try {
    const response = await fetch(`${API_BASE}/api/join-room`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId: roomCode, username }),
    });
    const data = await response.json();

    if (data.type === "error" || data.type === "room_full") {
      updateStatus(data.error || "Room is full");
      return;
    }

    handleAPIMessage(data);
    startPolling();
  } catch (error) {
    console.error("Error joining room:", error);
    updateStatus("Failed to join room. Check the code.");
  }
}

async function sendSignalAPI(signal) {
  try {
    await fetch(`${API_BASE}/api/signal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId, signal }),
    });
  } catch (error) {
    console.error("Error sending signal:", error);
  }
}

function startPolling() {
  if (pollingInterval) return;

  pollingInterval = setInterval(async () => {
    if (!roomId) {
      stopPolling();
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/api/poll/${roomId}`);
      const data = await response.json();

      if (data.messages && data.messages.length > 0) {
        data.messages.forEach((msg) => handleAPIMessage(msg));
      }
    } catch (error) {
      console.error("Polling error:", error);
    }
  }, POLL_INTERVAL);
}

function stopPolling() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
}

async function handleAPIMessage(message) {
  console.log("Received message:", message);
  // This will handle all the message types like the old ws.onmessage
  // We'll keep the existing switch logic but call it from here
  await processMessage(message);
}

function connectWebSocket() {
  // Smart WebSocket URL configuration
  // For GitHub Pages: Use Railway/Render backend
  // For localhost: Use local WebSocket server
  const isLocalhost =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1";

  let wsUrl;
  if (isLocalhost) {
    // Local development
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    wsUrl = `${protocol}//${window.location.hostname}:8080`;
  } else {
    // Production: Change this to your Railway/Render backend URL
    wsUrl = "wss://wave-connect-production.up.railway.app"; // Update after deploying to Railway
  }

  console.log("Connecting to WebSocket server at:", wsUrl);
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log("Signaling server connected.");
  };

  ws.onmessage = async (event) => {
    const message = JSON.parse(event.data);
    console.log("Received signaling message:", message);

    switch (message.type) {
      case "room_created":
        roomId = message.roomId;
        console.log(`Room ${roomId} created.`);
        roomCodeDisplay.classList.remove("hidden");
        roomCodeElement.textContent = roomId;
        isCaller = true;
        // Automatically copy the room code to clipboard when room is created
        setTimeout(() => {
          copyRoomBtn.click();
        }, 500);
        updateStatus(`Room ${roomId} created. Select call type to start.`);

        // Show call type selection after room is created
        showCallTypeSelection();
        break;
      case "room_joined":
        console.log("Joined room", message.roomId);
        console.log("Room joined message:", message);
        roomId = message.roomId; // Ensure roomId is set from the server response
        // Show the room code display for both caller and callee
        roomCodeDisplay.classList.remove("hidden");
        roomCodeElement.textContent = roomId;

        // Store peer username if provided
        if (message.peerUsername) {
          peerUsername = message.peerUsername;
          updatePeerInfo(peerUsername);
        }

        // Automatically copy the room code to clipboard when room is joined
        setTimeout(() => {
          copyRoomBtn.click();
        }, 500);

        // Check if there's an active call type in the room
        console.log(`Checking call type from server: ${message.callType}`);
        if (message.callType) {
          // Auto-start the matching call type
          console.log(`Auto-starting ${message.callType} call to match peer`);
          updateStatus(
            `${peerUsername || "Peer"} has started a ${
              message.callType
            } call. Joining...`
          );

          // Auto-start the call with the same type
          const hasVideo = message.callType === "video";
          console.log(
            `[AUTO-START] Starting call with video: ${hasVideo} based on callType: ${message.callType}`
          );
          setTimeout(() => {
            startCall(hasVideo);
          }, 1000);
        } else {
          // No active call yet, show call type selection
          updateStatus(`Joined room ${roomId}. Select call type to start.`);
          showCallTypeSelection();
        }

        console.log("Room joined successfully. Peer may already be waiting.");
        break;
      case "peer_joined":
        console.log("Peer joined the room");
        // Store peer username if provided
        if (message.username) {
          peerUsername = message.username;
          console.log(`Peer identified as: ${peerUsername}`);
          updateStatus(`${peerUsername} joined the room. Starting call...`);
          updatePeerInfo(peerUsername);
        } else {
          updateStatus("Peer joined the room. Starting call...");
        }
        if (isCaller && peerConnection) {
          console.log("I am the caller, creating offer...");
          try {
            // Create offer with optimal settings
            const offer = await peerConnection.createOffer({
              offerToReceiveAudio: true,
              offerToReceiveVideo: true,
              iceRestart: false,
            });
            await peerConnection.setLocalDescription(offer);
            sendMessage({
              type: "offer",
              sdp: peerConnection.localDescription,
            });
            console.log("Offer sent to peer.");
          } catch (error) {
            console.error("Error creating offer:", error);
            updateStatus("Error creating call. Please try again.");
          }
        } else if (isCaller && !peerConnection) {
          console.log(
            "Peer joined but peer connection not ready yet. Will create offer when media starts."
          );
        }
        break;
      case "offer":
        console.log("========= RECEIVED OFFER =========");
        console.log("Offer SDP:", message.sdp);
        // Store peer username if provided
        if (message.username) {
          peerUsername = message.username;
          console.log(`Offer from: ${peerUsername}`);
          updateStatus(`${peerUsername} is calling...`);
          updatePeerInfo(peerUsername);
        } else {
          updateStatus("Peer found! Connecting...");
        }

        // Start media if not already started (for joiner who hasn't selected call type yet)
        if (!localStream) {
          console.log(
            "[OFFER-PATH] Starting media stream to respond to offer..."
          );
          // Determine if offer has ACTIVE video by checking SDP
          const sdpText = message.sdp.sdp;

          // Robust SDP analysis: Check for active video transmission
          // Audio-only: m=video with port 0 OR a=recvonly OR a=inactive
          const videoMediaMatch = sdpText.match(/m=video\s+(\d+)/);
          const videoPort = videoMediaMatch ? parseInt(videoMediaMatch[1]) : 0;

          // Check direction attributes in video section
          const hasVideoSendRecv = sdpText.match(/m=video[\s\S]*?a=sendrecv/);
          const hasVideoSendOnly = sdpText.match(/m=video[\s\S]*?a=sendonly/);
          const hasVideoInactive = sdpText.match(/m=video[\s\S]*?a=inactive/);
          const hasVideoRecvOnly = sdpText.match(/m=video[\s\S]*?a=recvonly/);

          // Video is active ONLY if: port > 0 AND (sendrecv OR sendonly) AND NOT (inactive OR recvonly)
          const hasActiveVideo =
            videoPort > 0 &&
            (hasVideoSendRecv || hasVideoSendOnly) &&
            !hasVideoInactive &&
            !hasVideoRecvOnly;

          console.log(`[OFFER-PATH] SDP Analysis:`);
          console.log(`  Has m=video: ${videoMediaMatch !== null}`);
          console.log(`  Video port: ${videoPort}`);
          console.log(`  Has sendrecv: ${!!hasVideoSendRecv}`);
          console.log(`  Has sendonly: ${!!hasVideoSendOnly}`);
          console.log(`  Has inactive: ${!!hasVideoInactive}`);
          console.log(`  Has recvonly: ${!!hasVideoRecvOnly}`);
          console.log(`  Final hasActiveVideo: ${hasActiveVideo}`);

          updateStatus(`Joining ${hasActiveVideo ? "video" : "audio"} call...`);

          const mediaStarted = await startMedia(hasActiveVideo, true); // Skip status update
          if (!mediaStarted) {
            console.error("Failed to start media, cannot respond to offer");
            updateStatus("Failed to access camera/microphone");
            break;
          }
          // Show the call UI now that we have media
          showCallUI();
        } else {
          console.log(
            "[OFFER-PATH] Local stream already exists, skipping media start"
          );
        }

        if (!peerConnection) {
          console.log("Creating peer connection to handle offer...");
          await createPeerConnection();
        }
        console.log("Setting remote description from offer...");
        await peerConnection.setRemoteDescription(
          new RTCSessionDescription(message.sdp)
        );
        console.log("Creating answer...");
        // Create answer with matching constraints to the offer
        // Only offer to receive video if the offer included active video
        const offerHasVideo =
          message.sdp.sdp.includes("m=video") &&
          !message.sdp.sdp.match(/m=video\s+0/);

        console.log(
          `Creating answer with offerToReceiveVideo: ${offerHasVideo}`
        );

        const answer = await peerConnection.createAnswer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: offerHasVideo,
        });
        await peerConnection.setLocalDescription(answer);
        console.log("Sending answer to peer...");
        sendMessage({
          type: "answer",
          sdp: peerConnection.localDescription,
        });
        console.log("Answer sent successfully.");
        updateStatus("Establishing connection...");

        // Show call UI if not already shown
        if (callScreen.classList.contains("active") === false) {
          showCallUI();
        }

        console.log("========= OFFER HANDLED =========");
        break;
      case "answer":
        console.log("Received answer from peer.");
        try {
          await peerConnection.setRemoteDescription(
            new RTCSessionDescription(message.sdp)
          );
          console.log("Remote description set successfully from answer.");
          updateStatus("Finalizing connection...");
        } catch (error) {
          console.error("Error setting remote description:", error);
          updateStatus("Error in connection. Please try again.");
        }
        break;
      case "candidate":
        console.log(
          "Received ICE candidate:",
          message.candidate?.type || "unknown"
        );
        if (peerConnection && peerConnection.remoteDescription) {
          try {
            await peerConnection.addIceCandidate(
              new RTCIceCandidate(message.candidate)
            );
            console.log("ICE candidate added successfully.");
          } catch (error) {
            console.error("Error adding ICE candidate:", error);
            // Don't update status for candidate errors as they're often non-critical
          }
        } else {
          console.warn(
            "Received ICE candidate before remote description was set. Buffering may be needed."
          );
        }
        break;
      case "peer_ready":
        console.log("Peer is ready in the room.");
        if (isCaller && peerConnection) {
          console.log("Creating offer for ready peer...");
          try {
            const offer = await peerConnection.createOffer({
              offerToReceiveAudio: true,
              offerToReceiveVideo: true,
              iceRestart: false,
            });
            await peerConnection.setLocalDescription(offer);
            sendMessage({
              type: "offer",
              sdp: peerConnection.localDescription,
            });
            console.log("Offer sent to ready peer.");
          } catch (error) {
            console.error("Error creating offer for ready peer:", error);
          }
        }
        break;
      case "room_full":
        updateStatus("The room is full. Please try a different room.");
        showSessionUI();
        break;
      case "peer_left":
        if (peerUsername) {
          updateStatus(`${peerUsername} has left the call.`);
        } else {
          updateStatus("Peer has left the call.");
        }
        hangUp();
        break;
      case "call_type_notification":
        // Peer has selected a call type
        console.log(`Peer started ${message.callType} call`);
        if (message.username) {
          peerUsername = message.username;
          updatePeerInfo(peerUsername);
        }

        // If we haven't started our call yet, auto-start with the same type
        if (!localStream) {
          const hasVideo = message.callType === "video";
          console.log(
            `Auto-starting call from notification with video: ${hasVideo}`
          );
          updateStatus(
            `${peerUsername || "Peer"} started a ${
              message.callType
            } call. Joining...`
          );
          setTimeout(() => {
            startCall(hasVideo);
          }, 1000);
        }
        break;
      case "screen_share_started":
        console.log("Peer started screen sharing");
        isRemoteScreenSharing = true;
        // Remove camera-feed class from remote video to stop mirroring
        remoteVideo.classList.remove("camera-feed");
        updateStatus(`${peerUsername || "Peer"} is sharing their screen`);
        break;
      case "screen_share_stopped":
        console.log("Peer stopped screen sharing");
        isRemoteScreenSharing = false;
        // Re-add camera-feed class to remote video to restore mirroring
        remoteVideo.classList.add("camera-feed");
        updateStatus("Connected");
        break;
      case "camera_switched":
        console.log("Peer switched camera to:", message.facingMode);
        // Mirror only front camera, not back camera
        if (message.facingMode === "user") {
          remoteVideo.classList.add("camera-feed");
        } else {
          remoteVideo.classList.remove("camera-feed");
        }
        break;
      case "error":
        console.error("Signaling error:", message.error);
        updateStatus(`Error: ${message.error}`);
        if (message.error === "Room not found") {
          setTimeout(() => {
            showSessionUI();
          }, 2000);
        }
        break;
    }
  };

  ws.onclose = () => {
    console.log(
      "Signaling server connection closed. Attempting to reconnect..."
    );
    updateStatus("Disconnected from server. Retrying...");

    // Only reconnect if not intentionally closing
    if (peerConnection || localStream) {
      setTimeout(connectWebSocket, 3000); // Reconnect after 3 seconds
    }
  };

  ws.onerror = (error) => {
    console.error("WebSocket error:", error);
    updateStatus(
      "WebSocket error. If using a self-signed certificate, " +
        "try opening a new tab to the server URL, accept the security warning, " +
        "and then refresh this page."
    );
    ws.close();
  };
}

function sendMessage(message) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    // Add username to all messages
    const payload = JSON.stringify({ ...message, roomId, username });
    console.log(
      "Sending message:",
      message.type,
      "for room:",
      roomId,
      "from:",
      username || "Anonymous"
    );
    ws.send(payload);
  } else {
    console.error(
      "Cannot send message, WebSocket is not open. State:",
      ws?.readyState
    );
    updateStatus("Connection lost. Please refresh the page.");
  }
}

async function startMedia(hasVideo, skipStatusUpdate = false) {
  try {
    console.log(
      `[startMedia] Starting media with hasVideo=${hasVideo}, skipStatusUpdate=${skipStatusUpdate}`
    );
    console.log(`[startMedia] Call stack trace:`, new Error().stack);

    // Track if this is an audio-only call
    isAudioOnlyCall = !hasVideo;
    console.log(`[startMedia] Set isAudioOnlyCall to: ${isAudioOnlyCall}`);

    // High-quality media constraints with proper aspect ratio
    const constraints = {
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 48000,
      },
      video: hasVideo
        ? {
            width: { ideal: 1280, max: 1920 },
            height: { ideal: 720, max: 1080 },
            aspectRatio: { ideal: 16 / 9 },
            frameRate: { ideal: 30, max: 60 },
            facingMode: "user",
          }
        : false,
    };

    console.log(
      `[startMedia] getUserMedia constraints:`,
      JSON.stringify(constraints, null, 2)
    );

    localStream = await navigator.mediaDevices.getUserMedia(constraints);
    localVideo.srcObject = localStream;
    // Ensure camera feed is mirrored properly
    if (hasVideo) {
      localVideo.classList.add("camera-feed");
    }
    console.log("Media stream obtained successfully.");
    initializeCameraSwitcher();

    // Initialize audio visualizer for local stream
    initializeLocalAudioVisualizer();

    // Better status message based on role (only if not skipping)
    if (!skipStatusUpdate) {
      if (isCaller) {
        updateStatus("Waiting for a peer to join...");
      } else {
        updateStatus("Ready! Waiting for connection...");
      }
    }
    return true;
  } catch (e) {
    console.error("getUserMedia error:", e);
    if (e.name === "NotAllowedError" || e.name === "PermissionDeniedError") {
      updateStatus(
        "Permission denied for camera/microphone. Please allow access and try again."
      );
    } else if (e.name === "NotFoundError") {
      updateStatus(
        "No camera/microphone found. Please connect a device and try again."
      );
    } else {
      updateStatus(`Error accessing media devices: ${e.message}`);
    }
    showSessionUI();
    return false;
  }
}

async function startCall(hasVideo) {
  console.log(`[startCall] Starting ${hasVideo ? "video" : "audio"} call...`);
  console.log(
    `[startCall] Current localStream state:`,
    localStream ? "exists" : "null"
  );

  // Prevent duplicate calls
  if (localStream) {
    console.log("[startCall] Call already in progress, aborting");
    return;
  }

  console.log(
    `[startCall] Proceeding to start media with hasVideo=${hasVideo}`
  );
  if (await startMedia(hasVideo)) {
    showCallUI();

    // Create peer connection after media is ready
    await createPeerConnection();

    // Start connection quality monitoring
    startConnectionMonitoring();

    // If this is the caller and peer already joined, create offer now
    if (isCaller) {
      // Check if there's already a peer in the room by sending a ready signal
      sendMessage({ type: "ready" });
    }
  }
}

function showCallTypeSelection() {
  sessionUi.style.display = "none";
  callTypeSelection.style.display = "block";
}

voiceCallBtn.onclick = () => {
  // Notify server about call type selection
  sendMessage({ type: "call_type_selected", callType: "audio" });
  startCall(false);
};

videoCallBtn.onclick = () => {
  // Notify server about call type selection
  sendMessage({ type: "call_type_selected", callType: "video" });
  startCall(true);
};

moreOptionsBtn.onclick = () => {
  alert("More options coming soon!");
};

async function createPeerConnection() {
  if (peerConnection) {
    console.log("Peer connection already exists.");
    return;
  }

  console.log("Creating peer connection...");
  peerConnection = new RTCPeerConnection(stunServers);
  console.log("Peer connection created.");

  // ICE candidate handling with buffering
  const pendingCandidates = [];
  let remoteDescriptionSet = false;

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      console.log("Sending ICE candidate:", event.candidate.type);
      sendMessage({
        type: "candidate",
        candidate: event.candidate,
      });
    } else {
      console.log("All ICE candidates have been sent.");
    }
  };

  // Enhanced track handling
  peerConnection.ontrack = (event) => {
    console.log(
      "Received remote track:",
      event.track.kind,
      "with streams:",
      event.streams.length
    );

    if (event.streams && event.streams[0]) {
      remoteStream = event.streams[0];
      remoteVideo.srcObject = remoteStream;

      // Check if it's a screen share based on track settings
      // Screen shares typically have different characteristics
      checkIfRemoteIsScreenShare(event.track);

      // Initialize audio visualizer for remote stream
      initializeRemoteAudioVisualizer();

      updateStatus("Connected");
      callStatusElement.textContent = "Connected";
      console.log("Remote stream received and connected!");
    }
  };

  // Add local tracks with proper configuration
  if (localStream) {
    localStream.getTracks().forEach((track) => {
      const sender = peerConnection.addTrack(track, localStream);
      console.log(`Added ${track.kind} track to peer connection.`);

      // Set encoding parameters for better quality
      if (track.kind === "video") {
        const parameters = sender.getParameters();
        if (!parameters.encodings) {
          parameters.encodings = [{}];
        }
        parameters.encodings[0].maxBitrate = 2500000; // 2.5 Mbps
        sender
          .setParameters(parameters)
          .catch((e) => console.log("Set parameters error:", e));
      }
    });
  }

  // Connection state monitoring
  peerConnection.onconnectionstatechange = () => {
    console.log(`Connection state: ${peerConnection.connectionState}`);
    switch (peerConnection.connectionState) {
      case "connecting":
        updateStatus("Connecting...");
        callStatusElement.textContent = "Connecting...";
        break;
      case "connected":
        updateStatus("Connected");
        callStatusElement.textContent = "Connected";
        console.log("✅ Peer-to-peer connection established successfully!");
        break;
      case "disconnected":
        updateStatus("Disconnected. Trying to reconnect...");
        callStatusElement.textContent = "Reconnecting...";
        console.warn("Connection disconnected, attempting to reconnect...");
        break;
      case "closed":
        updateStatus("Connection closed");
        callStatusElement.textContent = "Call ended";
        break;
      case "failed":
        updateStatus("Connection failed. Please try again.");
        callStatusElement.textContent = "Connection failed";
        console.error("Connection failed. Cleaning up...");
        hangUp();
        break;
    }
  };

  // ICE connection state monitoring
  peerConnection.oniceconnectionstatechange = () => {
    console.log(`ICE connection state: ${peerConnection.iceConnectionState}`);
    switch (peerConnection.iceConnectionState) {
      case "checking":
        updateStatus("Finding best connection path...");
        break;
      case "connected":
      case "completed":
        updateStatus("Peer-to-peer connection established!");
        console.log("✅ ICE connection successful!");
        break;
      case "failed":
        updateStatus("ICE connection failed. Network issue detected.");
        console.error(
          "ICE connection failed. This might be a firewall/NAT issue."
        );
        break;
      case "disconnected":
        updateStatus("ICE connection disconnected.");
        console.warn("ICE disconnected. May reconnect automatically.");
        break;
    }
  };

  // ICE gathering state
  peerConnection.onicegatheringstatechange = () => {
    console.log(`ICE gathering state: ${peerConnection.iceGatheringState}`);
  };

  // Signaling state
  peerConnection.onsignalingstatechange = () => {
    console.log(`Signaling state: ${peerConnection.signalingState}`);
  };

  // Negotiation needed
  peerConnection.onnegotiationneeded = async () => {
    console.log("Negotiation needed event fired");
  };
}

createRoomBtn.onclick = async () => {
  // Get username
  username = usernameInput.value.trim() || "Anonymous";
  if (username.length > 20) {
    username = username.substring(0, 20);
  }
  console.log("Creating room with username:", username);
  localNameElement.textContent = username + " (You)";

  updateStatus("Connecting to server...");

  // Initialize WebSocket connection if not already connected
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    connectWebSocket();

    // Wait for WebSocket to be ready
    try {
      await new Promise((resolve, reject) => {
        const checkConnection = () => {
          if (ws.readyState === WebSocket.OPEN) {
            resolve();
          } else if (
            ws.readyState === WebSocket.CLOSED ||
            ws.readyState === WebSocket.CLOSING
          ) {
            reject(new Error("Failed to connect to server"));
          } else {
            setTimeout(checkConnection, 100);
          }
        };
        checkConnection();
      });
    } catch (error) {
      console.error("WebSocket connection error:", error);
      updateStatus("Failed to connect to server. Please try again.");
      return;
    }
  }

  isCaller = true;
  updateStatus("Creating room...");

  // CRITICAL FIX: Send create_room message IMMEDIATELY
  sendMessage({ type: "create_room" });

  // The room_created response will trigger showing call type selection
};

joinRoomBtn.onclick = async () => {
  const code = roomInput.value.trim().toUpperCase();
  if (!code) {
    updateStatus("Please enter a room code.");
    return;
  }

  // Get username
  username = usernameInput.value.trim() || "Anonymous";
  if (username.length > 20) {
    username = username.substring(0, 20);
  }
  console.log("Joining room with username:", username);
  localNameElement.textContent = username + " (You)";

  updateStatus("Connecting to server...");

  // Initialize WebSocket connection if not already connected
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    connectWebSocket();

    // Wait for WebSocket to be ready
    try {
      await new Promise((resolve, reject) => {
        const checkConnection = () => {
          if (ws.readyState === WebSocket.OPEN) {
            resolve();
          } else if (
            ws.readyState === WebSocket.CLOSED ||
            ws.readyState === WebSocket.CLOSING
          ) {
            reject(new Error("Failed to connect to server"));
          } else {
            setTimeout(checkConnection, 100);
          }
        };
        checkConnection();
      });
    } catch (error) {
      console.error("WebSocket connection error:", error);
      updateStatus("Failed to connect to server. Please try again.");
      return;
    }
  }

  roomId = code;
  isCaller = false;
  updateStatus(`Joining room ${code}...`);

  // Send join room message immediately
  sendMessage({ type: "join_room", roomId: code });

  // The room_joined response will trigger showing call type selection
};

toggleMicBtn.onclick = () => {
  if (!localStream) return;
  const audioTrack = localStream.getAudioTracks()[0];
  if (!audioTrack) {
    updateStatus("No audio track available.");
    return;
  }
  if (audioTrack.enabled) {
    audioTrack.enabled = false;
    micOnIcon.classList.add("hidden");
    micOffIcon.classList.remove("hidden");
    toggleMicBtn.classList.add("active");
    // Stop local visualizer when muted
    if (localAnimationId) {
      cancelAnimationFrame(localAnimationId);
      localAnimationId = null;
      resetLocalVisualizer();
    }
    console.log("Microphone muted.");
  } else {
    audioTrack.enabled = true;
    micOnIcon.classList.remove("hidden");
    micOffIcon.classList.add("hidden");
    toggleMicBtn.classList.remove("active");
    // Restart local visualizer when unmuted
    if (localAnalyser && !localAnimationId) {
      animateLocalVisualizer();
    }
    console.log("Microphone unmuted.");
  }
};

toggleCameraBtn.onclick = () => {
  if (!localStream) return;
  const videoTrack = localStream.getVideoTracks()[0];
  if (!videoTrack) {
    updateStatus("No video track available. This is an audio-only call.");
    return;
  }
  if (videoTrack.enabled) {
    videoTrack.enabled = false;
    cameraOnIcon.classList.add("hidden");
    cameraOffIcon.classList.remove("hidden");
    toggleCameraBtn.classList.add("active");
    console.log("Camera turned off.");
  } else {
    videoTrack.enabled = true;
    cameraOnIcon.classList.remove("hidden");
    cameraOffIcon.classList.add("hidden");
    toggleCameraBtn.classList.remove("active");
    console.log("Camera turned on.");
  }
};

endCallBtn.onclick = () => {
  if (confirm("Are you sure you want to end the call?")) {
    sendMessage({ type: "leave_room" });
    hangUp();
  }
};

// Screen sharing functionality
shareScreenBtn.onclick = async () => {
  try {
    // Check if on mobile device
    const isMobile =
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
      );

    if (isMobile) {
      updateStatus("Screen sharing is not supported on mobile browsers.");
      alert(
        "Screen sharing is not available on mobile devices due to browser limitations. Please use a desktop browser."
      );
      return;
    }

    console.log("Starting screen share...");
    screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        cursor: "always",
        displaySurface: "monitor",
      },
      audio: false,
    });

    const screenTrack = screenStream.getVideoTracks()[0];

    // Find the video sender and replace the track
    const sender = peerConnection
      .getSenders()
      .find((s) => s.track && s.track.kind === "video");

    if (sender) {
      originalLocalVideoTrack = sender.track; // Store original camera track
      await sender.replaceTrack(screenTrack);
      localVideo.srcObject = screenStream;

      // Remove camera-feed class to prevent mirroring
      localVideo.classList.remove("camera-feed");
      isLocalScreenSharing = true;

      console.log("Screen sharing started.");
      updateStatus("Sharing screen...");

      // Notify peer that we're screen sharing
      sendMessage({ type: "screen_share_started" });

      // Show/hide buttons
      shareScreenBtn.classList.add("hidden");
      stopShareScreenBtn.classList.remove("hidden");

      // Handle screen share stop (when user clicks browser's stop sharing)
      screenTrack.onended = () => {
        stopScreenShare();
      };
    }
  } catch (error) {
    console.error("Error sharing screen:", error);
    if (error.name === "NotAllowedError") {
      updateStatus("Screen sharing permission denied.");
    } else if (error.name === "NotSupportedError") {
      updateStatus("Screen sharing is not supported on this browser.");
    } else {
      updateStatus("Failed to share screen.");
    }
  }
};

stopShareScreenBtn.onclick = () => {
  stopScreenShare();
};

async function stopScreenShare() {
  if (!screenStream) return;

  console.log("Stopping screen share...");

  // Stop screen stream
  screenStream.getTracks().forEach((track) => track.stop());
  screenStream = null;

  // Restore original camera track
  if (originalLocalVideoTrack && peerConnection) {
    const sender = peerConnection
      .getSenders()
      .find((s) => s.track && s.track.kind === "video");

    if (sender) {
      await sender.replaceTrack(originalLocalVideoTrack);
      localVideo.srcObject = localStream;

      // Re-add camera-feed class to restore mirroring
      localVideo.classList.add("camera-feed");
      isLocalScreenSharing = false;

      console.log("Restored camera feed.");
    }
  } else {
    localVideo.srcObject = localStream;
    localVideo.classList.add("camera-feed");
    isLocalScreenSharing = false;
  }

  // Notify peer that we stopped screen sharing
  sendMessage({ type: "screen_share_stopped" });

  updateStatus("Screen sharing stopped.");
  shareScreenBtn.classList.remove("hidden");
  stopShareScreenBtn.classList.add("hidden");
}

function checkIfRemoteIsScreenShare(track) {
  // This is called when we receive a remote track
  // The screen share state is now tracked via signaling messages
  // (screen_share_started and screen_share_stopped)
  // This function is kept for potential future enhancements
  if (track.kind === "video") {
    const settings = track.getSettings();
    console.log("Remote video track settings:", settings);
  }
}

function hangUp() {
  console.log("Hanging up call...");

  // Stop monitoring
  stopConnectionMonitoring();

  // Stop audio visualizers
  stopAudioVisualizers();

  // Stop screen sharing if active
  if (screenStream) {
    screenStream.getTracks().forEach((track) => track.stop());
    screenStream = null;
  }

  // Reset screen sharing states
  isLocalScreenSharing = false;
  isRemoteScreenSharing = false;
  originalLocalVideoTrack = null;
  isAudioOnlyCall = false;

  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  if (localStream) {
    localStream.getTracks().forEach((track) => {
      track.stop();
      console.log(`Stopped ${track.kind} track`);
    });
    localStream = null;
  }
  localVideo.srcObject = null;
  remoteVideo.srcObject = null;
  remoteStream = null;

  // Reset screen share buttons
  if (shareScreenBtn) shareScreenBtn.classList.remove("hidden");
  if (stopShareScreenBtn) stopShareScreenBtn.classList.add("hidden");

  // Reset video classes
  localVideo.classList.add("camera-feed");
  remoteVideo.classList.add("camera-feed");

  showSessionUI();
  updateStatus("Call ended. Create or join a new room.");
}

function showCallUI() {
  welcomeScreen.style.display = "none";
  callTypeSelection.classList.add("hidden");
  callScreen.classList.add("active");

  const hasVideo = localStream.getVideoTracks().length > 0;

  // Disable/enable camera controls based on call type
  if (!hasVideo) {
    // Audio-only call - disable camera controls
    toggleCameraBtn.disabled = true;
    toggleCameraBtn.style.opacity = "0.5";
    toggleCameraBtn.style.cursor = "not-allowed";
    switchCameraBtn.classList.add("hidden");

    // Hide local video wrapper for audio-only calls
    const localWrapper = document.getElementById("local-video-wrapper");
    if (localWrapper) {
      localWrapper.style.display = "none";
    }

    console.log("Audio-only call mode activated");
  } else {
    // Video call - enable camera controls
    toggleCameraBtn.disabled = false;
    toggleCameraBtn.style.opacity = "1";
    toggleCameraBtn.style.cursor = "pointer";

    // Show local video wrapper for video calls
    const localWrapper = document.getElementById("local-video-wrapper");
    if (localWrapper) {
      localWrapper.style.display = "flex";
    }
  }

  // Ensure proper mirroring for camera feeds
  if (hasVideo && !isLocalScreenSharing) {
    localVideo.classList.add("camera-feed");
  }
  if (!isRemoteScreenSharing) {
    remoteVideo.classList.add("camera-feed");
  }

  // Update local name
  localNameElement.textContent = username + " (You)";
}

function showSessionUI() {
  welcomeScreen.style.display = "block";
  callScreen.classList.remove("active");
  callTypeSelection.classList.add("hidden");
  roomInput.value = "";
  roomCodeDisplay.classList.add("hidden");
  roomCodeElement.textContent = "";
  isCaller = false;
  roomId = null;
  peerUsername = "";

  // Reset peer info
  peerNameElement.textContent = "Connecting...";
  peerAvatar.textContent = "P";
  callStatusElement.textContent = "Calling...";
  localNameElement.textContent = "You";

  // Re-enable room creation/join buttons
  joinRoomBtn.disabled = false;
  createRoomBtn.disabled = false;

  // Reset camera button state
  toggleCameraBtn.disabled = false;
  toggleCameraBtn.style.opacity = "1";
  toggleCameraBtn.style.cursor = "pointer";

  // Show local video wrapper again
  const localWrapper = document.getElementById("local-video-wrapper");
  if (localWrapper) {
    localWrapper.style.display = "flex";
  }

  // Reset WebRTC connection
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
}

function showCallTypeSelection() {
  // Show call type selection UI
  callTypeSelection.classList.remove("hidden");

  // Hide room creation/join buttons
  joinRoomBtn.disabled = true;
  createRoomBtn.disabled = true;

  // Update status message
  if (isCaller) {
    updateStatus(`${username}, your room is ready. Select call type:`);
  } else {
    updateStatus(`${username}, select call type to join:`);
  }
}

let currentFacingMode = "user";

async function initializeCameraSwitcher() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const videoInputs = devices.filter((device) => device.kind === "videoinput");
  if (videoInputs.length > 1) {
    switchCameraBtn.classList.remove("hidden");
  }
}

switchCameraBtn.onclick = async () => {
  if (!peerConnection) {
    console.warn("Cannot switch camera: no peer connection.");
    return;
  }

  try {
    currentFacingMode = currentFacingMode === "user" ? "environment" : "user";
    const constraints = {
      video: { facingMode: { exact: currentFacingMode } },
      audio: true,
    };
    const newStream = await navigator.mediaDevices.getUserMedia(constraints);
    const newVideoTrack = newStream.getVideoTracks()[0];
    const sender = peerConnection
      .getSenders()
      .find((s) => s.track && s.track.kind === "video");

    if (sender) {
      await sender.replaceTrack(newVideoTrack);
      localStream.removeTrack(localStream.getVideoTracks()[0]);
      localStream.addTrack(newVideoTrack);
      localVideo.srcObject = localStream;

      // Only mirror front camera, not back camera
      if (currentFacingMode === "user") {
        localVideo.classList.add("camera-feed");
      } else {
        localVideo.classList.remove("camera-feed");
      }

      // Notify peer about camera switch
      sendMessage({ type: "camera_switched", facingMode: currentFacingMode });

      console.log(`Switched camera to ${currentFacingMode} mode.`);
    }
  } catch (error) {
    console.error("Error switching camera:", error);
    updateStatus("Failed to switch camera.");
  }
};

function updateStatus(message) {
  if (statusMessage) {
    statusMessage.textContent = message;
    console.log("Status:", message);
  }
}

// Initialize WebSocket connection when the page loads
document.addEventListener("DOMContentLoaded", () => {
  console.log("DOM fully loaded, connecting to WebSocket server...");
  connectWebSocket();
});

// Room code handling
copyRoomBtn.addEventListener("click", async () => {
  const roomCode = roomCodeElement.textContent;
  try {
    await navigator.clipboard.writeText(roomCode);
    copyRoomBtn.textContent = "Copied!";
    copyRoomBtn.classList.add("copied");

    // Reset the button after 2 seconds
    setTimeout(() => {
      copyRoomBtn.textContent = "Copy";
      copyRoomBtn.classList.remove("copied");
    }, 2000);
  } catch (err) {
    console.error("Failed to copy room code: ", err);
    updateStatus("Failed to copy room code. Please copy it manually.");
  }
});

// Initialize WebSocket connection on page load
connectWebSocket();

// Connection quality monitoring
function startConnectionMonitoring() {
  if (!peerConnection) return;

  console.log("Starting connection quality monitoring...");

  // Monitor every 2 seconds
  statsInterval = setInterval(async () => {
    if (!peerConnection) {
      stopConnectionMonitoring();
      return;
    }

    try {
      const stats = await peerConnection.getStats();
      let inboundRTP = null;
      let outboundRTP = null;

      stats.forEach((report) => {
        if (report.type === "inbound-rtp" && report.kind === "video") {
          inboundRTP = report;
        }
        if (report.type === "outbound-rtp" && report.kind === "video") {
          outboundRTP = report;
        }
      });

      // Log connection quality metrics
      if (inboundRTP) {
        const packetsLost = inboundRTP.packetsLost || 0;
        const packetsReceived = inboundRTP.packetsReceived || 0;
        const lossRate =
          packetsReceived > 0 ? (packetsLost / packetsReceived) * 100 : 0;

        if (lossRate > 5) {
          console.warn(`High packet loss detected: ${lossRate.toFixed(2)}%`);
        }
      }
    } catch (error) {
      console.error("Error getting stats:", error);
    }
  }, 2000);
}

function stopConnectionMonitoring() {
  if (statsInterval) {
    clearInterval(statsInterval);
    statsInterval = null;
    console.log("Stopped connection monitoring.");
  }
  if (connectionQualityInterval) {
    clearInterval(connectionQualityInterval);
    connectionQualityInterval = null;
  }
}

// Helper function to update peer info
function updatePeerInfo(username) {
  peerUsername = username;
  peerNameElement.textContent = username;
  peerAvatar.textContent = username.charAt(0).toUpperCase();
  callStatusElement.textContent = "Connecting...";
}

// Theme toggle functionality
const body = document.body;

// Check for saved theme preference or default to 'light'
const currentTheme = localStorage.getItem("theme") || "light";
body.setAttribute("data-theme", currentTheme);
updateThemeIcon(currentTheme);

themeToggle.addEventListener("click", () => {
  const theme = body.getAttribute("data-theme");
  const newTheme = theme === "light" ? "dark" : "light";
  body.setAttribute("data-theme", newTheme);
  localStorage.setItem("theme", newTheme);
  updateThemeIcon(newTheme);
});

function updateThemeIcon(theme) {
  if (theme === "dark") {
    sunIcon.classList.add("hidden");
    moonIcon.classList.remove("hidden");
  } else {
    sunIcon.classList.remove("hidden");
    moonIcon.classList.add("hidden");
  }
}

// Hide screen share button on mobile devices
const isMobileDevice =
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
if (isMobileDevice) {
  shareScreenBtn.classList.add("hidden");
}

// ============================================
// AUDIO VISUALIZER IMPLEMENTATION
// ============================================

/**
 * Initialize audio visualizer for local stream
 */
function initializeLocalAudioVisualizer() {
  if (!localStream) {
    console.warn("Cannot initialize local visualizer: no local stream");
    return;
  }

  try {
    // Get audio track
    const audioTrack = localStream.getAudioTracks()[0];
    if (!audioTrack) {
      console.warn("No audio track found in local stream");
      return;
    }

    // Create audio context
    localAudioContext = new (window.AudioContext ||
      window.webkitAudioContext)();
    localAnalyser = localAudioContext.createAnalyser();

    // Configure analyser for better visualization
    localAnalyser.fftSize = 256; // Higher resolution for smoother bars
    localAnalyser.smoothingTimeConstant = 0.8; // Smooth transitions

    const bufferLength = localAnalyser.frequencyBinCount;
    localDataArray = new Uint8Array(bufferLength);

    // Create media stream source
    const source = localAudioContext.createMediaStreamSource(localStream);
    source.connect(localAnalyser);

    console.log("Local audio visualizer initialized");

    // Start animation
    animateLocalVisualizer();
  } catch (error) {
    console.error("Error initializing local audio visualizer:", error);
  }
}

/**
 * Initialize audio visualizer for remote stream
 */
function initializeRemoteAudioVisualizer() {
  if (!remoteStream) {
    console.warn("Cannot initialize remote visualizer: no remote stream");
    return;
  }

  try {
    // Get audio track
    const audioTrack = remoteStream.getAudioTracks()[0];
    if (!audioTrack) {
      console.warn("No audio track found in remote stream");
      return;
    }

    // Create audio context
    remoteAudioContext = new (window.AudioContext ||
      window.webkitAudioContext)();
    remoteAnalyser = remoteAudioContext.createAnalyser();

    // Configure analyser
    remoteAnalyser.fftSize = 256;
    remoteAnalyser.smoothingTimeConstant = 0.8;

    const bufferLength = remoteAnalyser.frequencyBinCount;
    remoteDataArray = new Uint8Array(bufferLength);

    // Create media stream source
    const source = remoteAudioContext.createMediaStreamSource(remoteStream);
    source.connect(remoteAnalyser);

    console.log("Remote audio visualizer initialized");

    // Start animation
    animateRemoteVisualizer();
  } catch (error) {
    console.error("Error initializing remote audio visualizer:", error);
  }
}

/**
 * Animate local audio visualizer
 */
function animateLocalVisualizer() {
  if (!localAnalyser || !localDataArray) return;

  localAnimationId = requestAnimationFrame(animateLocalVisualizer);

  // Get frequency data
  localAnalyser.getByteFrequencyData(localDataArray);

  // Calculate average amplitude for voice activity detection
  const average =
    localDataArray.reduce((a, b) => a + b, 0) / localDataArray.length;
  const isSpeaking = average > 15; // Threshold for voice activity

  // Only show visualizer effects for audio-only calls
  if (isAudioOnlyCall) {
    // Update center visualizer for audio-only calls
    const centerVisualizer = document.getElementById("center-visualizer");
    if (centerVisualizer) {
      centerVisualizer.classList.add("active");
      const centerBars = centerVisualizer.querySelectorAll(".center-audio-bar");
      updateBars(centerBars, localDataArray, average, 1.5); // Larger scale for center
    }
  } else {
    // Video call - hide all visual effects
    const centerVisualizer = document.getElementById("center-visualizer");
    if (centerVisualizer) {
      centerVisualizer.classList.remove("active");
    }
  }
}

/**
 * Animate remote audio visualizer
 */
function animateRemoteVisualizer() {
  if (!remoteAnalyser || !remoteDataArray) return;

  remoteAnimationId = requestAnimationFrame(animateRemoteVisualizer);

  // Get frequency data
  remoteAnalyser.getByteFrequencyData(remoteDataArray);

  // Calculate average amplitude for voice activity detection
  const average =
    remoteDataArray.reduce((a, b) => a + b, 0) / remoteDataArray.length;
  const isSpeaking = average > 15; // Threshold for voice activity

  // Only show visualizer effects for audio-only calls
  if (isAudioOnlyCall) {
    // Update peer avatar pulse ring
    const peerAvatar = document.getElementById("peer-avatar");
    if (peerAvatar) {
      if (isSpeaking) {
        peerAvatar.classList.add("speaking");
      } else {
        peerAvatar.classList.remove("speaking");
      }
    }

    // Update mini EQ bars beside avatar
    const avatarEq = document.getElementById("peer-eq");
    if (avatarEq) {
      const eqBars = avatarEq.querySelectorAll(".avatar-eq-bar");
      if (isSpeaking) {
        avatarEq.classList.add("active");
        updateBars(eqBars, remoteDataArray, average, 0.6); // Smaller scale for avatar
      } else {
        avatarEq.classList.remove("active");
        // Reset bars
        eqBars.forEach((bar) => {
          bar.style.height = "3px";
        });
      }
    }
  } else {
    // Video call - hide all visual effects
    const peerAvatar = document.getElementById("peer-avatar");
    if (peerAvatar) {
      peerAvatar.classList.remove("speaking");
    }

    const avatarEq = document.getElementById("peer-eq");
    if (avatarEq) {
      avatarEq.classList.remove("active");
    }
  }
}

/**
 * Update audio bars based on frequency data
 * @param {NodeList} bars - The bar elements to update
 * @param {Uint8Array} dataArray - The frequency data
 * @param {number} average - Average amplitude
 * @param {number} scale - Scale multiplier for bar height
 */
function updateBars(bars, dataArray, average, scale = 1) {
  if (!bars || bars.length === 0) return;

  const barCount = bars.length;
  const dataLength = dataArray.length;
  const step = Math.floor(dataLength / barCount);

  bars.forEach((bar, index) => {
    // Get frequency data for this bar (sample from different frequency ranges)
    const dataIndex = index * step;
    let value = dataArray[dataIndex] || 0;

    // Normalize value (0-255 to 0-100)
    value = (value / 255) * 100;

    // Apply scale and ensure minimum height
    const height = Math.max(4 * scale, value * scale);

    // Apply height with smooth transition
    bar.style.height = `${height}px`;
  });
}

/**
 * Reset local visualizer bars to minimum
 */
function resetLocalVisualizer() {
  const centerVisualizer = document.getElementById("center-visualizer");
  if (centerVisualizer) {
    const bars = centerVisualizer.querySelectorAll(".center-audio-bar");
    bars.forEach((bar) => {
      bar.style.height = "8px";
    });
  }
}

/**
 * Stop all audio visualizers
 */
function stopAudioVisualizers() {
  // Cancel animation frames
  if (localAnimationId) {
    cancelAnimationFrame(localAnimationId);
    localAnimationId = null;
  }
  if (remoteAnimationId) {
    cancelAnimationFrame(remoteAnimationId);
    remoteAnimationId = null;
  }

  // Close audio contexts
  if (localAudioContext) {
    localAudioContext.close();
    localAudioContext = null;
  }
  if (remoteAudioContext) {
    remoteAudioContext.close();
    remoteAudioContext = null;
  }

  // Reset variables
  localAnalyser = null;
  localDataArray = null;
  remoteAnalyser = null;
  remoteDataArray = null;

  // Reset UI elements
  resetLocalVisualizer();

  const peerAvatar = document.getElementById("peer-avatar");
  if (peerAvatar) {
    peerAvatar.classList.remove("speaking");
  }

  const avatarEq = document.getElementById("peer-eq");
  if (avatarEq) {
    avatarEq.classList.remove("active");
  }

  const centerVisualizer = document.getElementById("center-visualizer");
  if (centerVisualizer) {
    centerVisualizer.classList.remove("active");
  }

  console.log("Audio visualizers stopped");
}
