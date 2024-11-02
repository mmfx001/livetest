const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const socketIo = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid'); // To generate unique IDs

// Mongoose modellarini yaratish
const LiveStreamSchema = new mongoose.Schema({
    email: String,
    username: String,
    startTime: Date,
    videoTitle: String,
    status: String,
    roomId: { type: String, unique: true }, // Ensure roomId is unique
    endTime: Date,
    chat: [{ username: String, message: String, timestamp: Date }] // Chat xabarlarini saqlash
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
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
        credentials: true,
    }
});

app.use(cors());
app.use(express.json());

// Jonli efirlarni olish
app.get('/live', async (req, res) => {
    try {
        const streams = await LiveStream.find();
        res.json(streams);
    } catch (error) {
        res.status(500).json({ message: 'Jonli efirlarni olishda xatolik', error });
    }
});

// Jonli efir yaratish
app.post('/live', async (req, res) => {
    const { email, username, videoTitle, status } = req.body;

    try {
        const roomId = uuidv4(); // Generate unique room ID

        if (status === 'started') {
            const newStream = new LiveStream({ email, username, startTime: new Date(), videoTitle, status, roomId });
            await newStream.save();
            io.emit('user-connected', newStream);
            res.status(201).json(newStream);
        } else {
            res.status(400).json({ message: 'Invalid status' });
        }
    } catch (error) {
        res.status(500).json({ message: 'Jonli efirni yaratishda xatolik', error });
    }
});

// Jonli efirni tahrirlash (UPDATE)
app.put('/live/:roomId', async (req, res) => {
    const { roomId } = req.params;
    const { videoTitle, status, endTime } = req.body;

    try {
        const updatedStream = await LiveStream.findOneAndUpdate(
            { roomId },
            { videoTitle, status, endTime },
            { new: true }
        );

        if (!updatedStream) {
            return res.status(404).json({ message: 'Efir topilmadi' });
        }

        io.emit('stream-updated', updatedStream);
        res.status(200).json(updatedStream);
    } catch (error) {
        res.status(500).json({ message: 'Efirni tahrirlashda xatolik', error });
    }
});

// Jonli efirni o'chirish (DELETE)
app.delete('/live/:roomId', async (req, res) => {
    const { roomId } = req.params;

    try {
        const deletedStream = await LiveStream.findOneAndDelete({ roomId });

        if (!deletedStream) {
            return res.status(404).json({ message: 'Efir topilmadi' });
        }

        io.emit('stream-deleted', roomId);
        res.status(200).json({ message: 'Efir o\'chirildi' });
    } catch (error) {
        res.status(500).json({ message: 'Efirni o\'chirishda xatolik', error });
    }
});

// Socket.IO ulanishi
io.on('connection', (socket) => {
    console.log('Yangi foydalanuvchi ulanishdi:', socket.id);

    socket.on('send-message', async ({ roomId, username, message }) => {
        const chatMessage = { username, message, timestamp: new Date() };

        try {
            // Efirga chat xabarini qo'shamiz
            await LiveStream.findOneAndUpdate(
                { roomId },
                { $push: { chat: chatMessage } },
                { new: true }
            );

            // Barcha foydalanuvchilarga xabarni yuboramiz
            io.to(roomId).emit('new-message', chatMessage);
        } catch (error) {
            console.error('Chat xabarini saqlashda xatolik:', error);
        }
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
