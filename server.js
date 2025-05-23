const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const server = http.createServer(app);

// Track online users and typing status
const onlineUsers = new Map(); // userId -> socketId
const typingUsers = new Map(); // userId -> {chatId, timestamp}

// Create Socket.IO server
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Basic route for health check
app.get('/', (req, res) => {
  res.send('Socket server is running');
});

// Socket.IO connection handler
io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);
  
  socket.on('user-online', (userId) => {
    if (userId) {
      onlineUsers.set(userId, socket.id);
      // Broadcast to all clients that this user is online
      io.emit('user-status-change', { userId, status: 'online' });
      console.log(`User ${userId} is online`);
    }
  });
  
  // Join a chat room
  socket.on('join-chat', (chatId) => {
    socket.join(chatId);
    console.log(`Socket ${socket.id} joined chat: ${chatId}`);
  });
  
  // Leave a chat room
  socket.on('leave-chat', (chatId) => {
    socket.leave(chatId);
    console.log(`Socket ${socket.id} left chat: ${chatId}`);
  });
  
  // Handle typing status
  socket.on('typing-start', ({ userId, chatId }) => {
    if (userId && chatId) {
      typingUsers.set(userId, { chatId, timestamp: Date.now() });
      // Broadcast to chat room that user is typing
      socket.to(chatId).emit('user-typing', { userId, isTyping: true });
      console.log(`User ${userId} started typing in chat ${chatId}`);
    }
  });
  
  socket.on('typing-stop', ({ userId, chatId }) => {
    if (userId && chatId) {
      typingUsers.delete(userId);
      // Broadcast to chat room that user stopped typing
      socket.to(chatId).emit('user-typing', { userId, isTyping: false });
      console.log(`User ${userId} stopped typing in chat ${chatId}`);
    }
  });
  
  socket.on('send-message', async (messageData) => {
    try {
      const { chatId, content, userId } = messageData;
      
      console.log(`New message in chat ${chatId} from user ${userId}: ${content}`);
      
      io.to(chatId).emit('new-message', {
        chatId,
        message: messageData
      });
    } catch (error) {
      console.error('Error handling new message:', error);
    }
  });
  
  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`);
    
    let disconnectedUserId;
    for (const [userId, socketId] of onlineUsers.entries()) {
      if (socketId === socket.id) {
        disconnectedUserId = userId;
        break;
      }
    }
    
    if (disconnectedUserId) {
      onlineUsers.delete(disconnectedUserId);
      typingUsers.delete(disconnectedUserId);
      
      // Broadcast to all clients that this user is offline
      io.emit('user-status-change', { userId: disconnectedUserId, status: 'offline' });
      console.log(`User ${disconnectedUserId} is offline`);
    }
  });
});

setInterval(() => {
  const now = Date.now();
  for (const [userId, { chatId, timestamp }] of typingUsers.entries()) {
    if (now - timestamp > 5000) {
      typingUsers.delete(userId);
      io.to(chatId).emit('user-typing', { userId, isTyping: false });
    }
  }
}, 5000);

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Socket.IO server running on port ${PORT}`);
});