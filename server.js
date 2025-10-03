const express = require('express');
const http = require('http'); 
const { Server } = require('socket.io');
const path = require('path');

// Render.com'un atadığı portu veya yerel geliştirme için 3000'i kullan
const PORT = process.env.PORT || 3000;

const app = express();
const server = http.createServer(app);

// Socket.IO'yu CORS ayarları ile başlat
// Render URL'nizden gelen bağlantılara izin verir
const io = new Server(server, {
    cors: {
        origin: "*", // Tüm kaynaklardan gelen bağlantılara izin ver
        methods: ["GET", "POST"]
    }
});

const rooms = {};

// Statik dosyaları (index.html, room.html vb.) sun
app.use(express.static(path.join(__dirname)));

io.on('connection', (socket) => {
    console.log(`Yeni kullanıcı bağlandı: ${socket.id}`);

    // --- ODAYA KATILMA İŞLEVİ ---
    // Oda kodu, kullanıcı adı ve video URL'si istemciden gelir.
    socket.on('joinRoom', ({ roomCode, username, videoUrl }) => {
        
        if (!username) {
            username = 'AnonimKullanıcı';
        }
        
        socket.join(roomCode);
        socket.room = roomCode;
        socket.username = username;

        // Odayı başlat veya mevcut odayı kontrol et
        if (!rooms[roomCode]) {
            // ODA YENİ OLUŞTURULUYOR: Video URL'sini roomData'dan alıp sakla
            rooms[roomCode] = {
                users: {},
                state: {
                    isPlaying: false,
                    currentTime: 0,
                    // Oda kurucusunun gönderdiği video URL'sini kaydet
                    videoUrl: videoUrl 
                }
            };
        }
        
        rooms[roomCode].users[socket.id] = { username };

        // Kullanıcıya mevcut oda durumunu GÖNDER
        // NOT: Buradaki state objesi, videoUrl'yi de içerir.
        socket.emit('roomState', rooms[roomCode].state);
        
        // Odaya katılım mesajını ve güncel kullanıcı listesini yayınla
        const users = Object.values(rooms[roomCode].users).map(u => u.username);
        io.to(roomCode).emit('userJoined', { username, users });
        
        console.log(`${username} odaya katıldı: ${roomCode}`);
    });

    // --- VİDEO KONTROLÜ İŞLEVLERİ ---
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
    
    // --- SOHBET İŞLEVİ ---
    socket.on('chatMessage', (message) => {
        if (!socket.room) return;
        const msgData = {
            username: socket.username,
            message: message,
            time: new Date().toLocaleTimeString()
        };
        io.to(socket.room).emit('newChatMessage', msgData);
    });

    // --- BAĞLANTI KESİLME İŞLEVİ ---
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
        console.log(`Kullanıcı ayrıldı: ${socket.id}`);
    });
});

server.listen(PORT, () => {
    console.log(`Sunucu port ${PORT} adresinde başarıyla çalışıyor`);
});
