const express = require('express');
// DÜZELTLD: 'http' modülünün doru ekilde yüklenmesini saladk
const http = require('http'); 
const { Server } = require('socket.io');
const path = require('path');

// Render.com'un atad portu veya yerel gelitirme için 3000'i kullan
const PORT = process.env.PORT || 3000;

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const rooms = {};

// Statik dosyalar (index.html, room.html vb.) sun
app.use(express.static(path.join(__dirname)));

io.on('connection', (socket) => {
    console.log(`Yeni kullanc baland: ${socket.id}`);

    // --- ODAYA KATILMA LEV ---
    socket.on('joinRoom', ({ roomCode, username, videoUrl }) => {
        // Kullanc ad kontrolü
        if (!username) {
            username = 'AnonimKullanc';
        }
        
        socket.join(roomCode);
        socket.room = roomCode;
        socket.username = username;

        // Oday balat veya güncelle
        if (!rooms[roomCode]) {
            rooms[roomCode] = {
                users: {},
                state: {
                    isPlaying: false,
                    currentTime: 0,
                    videoUrl: videoUrl 
                }
            };
        }
        
        rooms[roomCode].users[socket.id] = { username };

        // Kullancya mevcut oda durumunu gönder
        socket.emit('roomState', rooms[roomCode].state);
        
        // Odaya katlm mesajn ve güncel kullanc listesini yaynla
        const users = Object.values(rooms[roomCode].users).map(u => u.username);
        io.to(roomCode).emit('userJoined', { username, users });
        
        console.log(`${username} odaya katld: ${roomCode}`);
    });

    // --- VDEO KONTROLÜ LEVLER ---
    socket.on('videoPlay', (time) => {
        if (!socket.room || !rooms[socket.room]) return;
        rooms[socket.room].state.isPlaying = true;
        rooms[socket.room].state.currentTime = time;
        socket.to(socket.room).emit('syncPlay', time);
    });

    socket.on('videoPause', (time) => {
        if (!socket.room || !rooms[socket.room]) return;
        rooms[socket.room].state.isPlaying = false;
        rooms[socket.room].state.currentTime = time;
        socket.to(socket.room).emit('syncPause', time);
    });

    socket.on('videoSeek', (time) => {
        if (!socket.room || !rooms[socket.room]) return;
        rooms[socket.room].state.currentTime = time;
        socket.to(socket.room).emit('syncSeek', time);
    });
    
    // --- SOHBET LEV ---
    socket.on('chatMessage', (message) => {
        if (!socket.room) return;
        const msgData = {
            username: socket.username,
            message: message,
            time: new Date().toLocaleTimeString()
        };
        io.to(socket.room).emit('newChatMessage', msgData);
    });

    // --- BALANTI KESLME LEV ---
    socket.on('disconnect', () => {
        if (socket.room && rooms[socket.room] && rooms[socket.room].users[socket.id]) {
            const username = socket.username;
            delete rooms[socket.room].users[socket.id];

            const users = Object.values(rooms[socket.room].users).map(u => u.username);
            io.to(socket.room).emit('userLeft', { username, users });

            if (Object.keys(rooms[socket.room].users).length === 0) {
                delete rooms[socket.room];
                console.log(`Oda temizlendi: ${socket.room}`);
            }
        }
        console.log(`Kullanc ayrld: ${socket.id}`);
    });
});

server.listen(PORT, () => {
    console.log(`Sunucu port ${PORT} adresinde çalyor`);
});
