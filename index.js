const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const socketIo = require('socket.io');
const cors = require('cors');

// Mongoose modellarini yaratish
const LiveStreamSchema = new mongoose.Schema({
    email: String,
    username: String,
    startTime: Date,
    videoTitle: String,
    status: String,
    roomId: String,
    endTime: Date,
});

const LiveStream = mongoose.model('LiveStream', LiveStreamSchema);

// MongoDBga ulanish
mongoose.connect('mongodb+srv://dilbekshermatov:dilbek1233@cluster0.14dvh.mongodb.net/myDatabase?retryWrites=true&w=majority&appName=Cluster0', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
}).then(() => {
    console.log('MongoDBga ulanish muvaffaqiyatli');
}).catch(err => {
    console.error('MongoDBga ulanishda xatolik:', err);
});

// Express va Socket.IO serverini sozlash
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: '*', // Allow requests from all origins (for testing only)
        methods: ['GET', 'POST'],
        credentials: true,
    }
});

app.use(cors());
app.use(express.json());

let liveStreams = []; // Jonli efirlar ma'lumotlarini saqlash uchun massiv

// Jonli efirlarni olish
app.get('/live', async (req, res) => {
    try {
        const streams = await LiveStream.find();
        res.json(streams);
    } catch (error) {
        res.status(500).json({ message: 'Jonli efirlarni olishda xatolik', error });
    }
});

// Jonli efir yaratish yoki to'xtatish
app.post('/live', async (req, res) => {
    const { email, username, startTime, videoTitle, status, roomId, endTime } = req.body;

    try {
        if (status === 'started') {
            const newStream = new LiveStream({ email, username, startTime, videoTitle, status, roomId });
            await newStream.save();
            liveStreams.push(newStream);
            io.emit('user-connected', newStream);
            res.status(201).json(newStream);
        } else if (status === 'stopped') {
            await LiveStream.findOneAndUpdate({ roomId }, { status, endTime });
            liveStreams = liveStreams.filter(stream => stream.roomId !== roomId);
            io.emit('user-disconnected', roomId);
            res.status(200).json({ message: 'Efir to‘xtatildi' });
        }
    } catch (error) {
        res.status(500).json({ message: 'Jonli efirni yaratishda yoki to‘xtatishda xatolik', error });
    }
});

// Socket.IO ulanishi
io.on('connection', (socket) => {
    console.log('Yangi foydalanuvchi ulanishdi:', socket.id);

    socket.on('connect_error', (err) => {
        console.log(`Connection error: ${err.message}`);
    });

    socket.on('start-stream', (streamData) => {
        liveStreams.push(streamData);
        io.emit('live-streams', liveStreams);
        socket.broadcast.emit('stream-started', streamData);
    });

    socket.on('stop-stream', (data) => {
        liveStreams = liveStreams.filter(stream => stream.roomId !== data.roomId);
        io.emit('live-streams', liveStreams);
        socket.broadcast.emit('stream-stopped', data.roomId);
    });

    socket.on('disconnect', () => {
        console.log('Foydalanuvchi uzildi:', socket.id);
    });
});

// Serverni ishga tushirish
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`Server ${PORT} portida ishlamoqd`);
});
