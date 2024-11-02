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
    chat: [{ _id: { type: String, default: uuidv4 }, username: String, message: String, timestamp: Date }] // Chat xabarlarini saqlash
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

// Jonli efirdagi chat xabarlarini olish
app.get('/live/:roomId/chat', async (req, res) => {
    const { roomId } = req.params;

    try {
        const liveStream = await LiveStream.findOne({ roomId });

        if (!liveStream) {
            return res.status(404).json({ message: 'Efir topilmadi' });
        }

        res.status(200).json(liveStream.chat);
    } catch (error) {
        res.status(500).json({ message: 'Chat xabarlarini olishda xatolik', error });
    }
});

// Jonli efirga chat xabarini qo'shish
app.post('/live/:roomId/chat', async (req, res) => {
    const { roomId } = req.params;
    const { username, message } = req.body;

    const chatMessage = { username, message, timestamp: new Date() };

    try {
        const updatedStream = await LiveStream.findOneAndUpdate(
            { roomId },
            { $push: { chat: chatMessage } },
            { new: true }
        );

        if (!updatedStream) {
            return res.status(404).json({ message: 'Efir topilmadi' });
        }

        // Barcha foydalanuvchilarga xabarni yuboramiz
        io.to(roomId).emit('new-message', chatMessage);
        res.status(201).json(chatMessage);
    } catch (error) {
        res.status(500).json({ message: 'Chat xabarini qo\'shishda xatolik', error });
    }
});

// Jonli efirda chat xabarini yangilash
app.put('/live/:roomId/chat/:messageId', async (req, res) => {
    const { roomId, messageId } = req.params;
    const { message } = req.body;

    try {
        const updatedStream = await LiveStream.findOneAndUpdate(
            { roomId, 'chat._id': messageId },
            { $set: { 'chat.$.message': message } },
            { new: true }
        );

        if (!updatedStream) {
            return res.status(404).json({ message: 'Efir yoki xabar topilmadi' });
        }

        // Yangilangan xabarni barcha foydalanuvchilarga yuboramiz
        const updatedMessage = updatedStream.chat.find(msg => msg._id.toString() === messageId);
        io.to(roomId).emit('message-updated', updatedMessage);
        res.status(200).json(updatedMessage);
    } catch (error) {
        res.status(500).json({ message: 'Chat xabarini yangilashda xatolik', error });
    }
});

// Jonli efirda chat xabarini o'chirish
app.delete('/live/:roomId/chat/:messageId', async (req, res) => {
    const { roomId, messageId } = req.params;

    try {
        const updatedStream = await LiveStream.findOneAndUpdate(
            { roomId },
            { $pull: { chat: { _id: messageId } } },
            { new: true }
        );

        if (!updatedStream) {
            return res.status(404).json({ message: 'Efir topilmadi' });
        }

        // O'chirilgan xabarni barcha foydalanuvchilarga yuboramiz
        io.to(roomId).emit('message-deleted', messageId);
        res.status(200).json({ message: 'Xabar o\'chirildi', messageId });
    } catch (error) {
        res.status(500).json({ message: 'Chat xabarini o\'chirishda xatolik', error });
    }
});

// Socket.IO ulanishi
io.on('connection', (socket) => {
    console.log('Yangi foydalanuvchi ulanishdi:', socket.id);

    socket.on('disconnect', () => {
        console.log('Foydalanuvchi uzildi:', socket.id);
    });
});

// Serverni ishga tushirish
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`Server ${PORT} portida ishlamoqd`);
});
