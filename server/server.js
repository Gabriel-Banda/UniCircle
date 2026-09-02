import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import multer from 'multer';
import { randomUUID } from 'crypto';

// Route imports
import authRoutes from './routes/auth.js';
import academicRoutes from './routes/academic.js';
import discussionsRoutes from './routes/discussions.js';
import commentsRoutes from './routes/comments.js';
import communitiesRoutes from './routes/communities.js';
import groupsRoutes from './routes/groups.js';
import notificationsRoutes from './routes/notifications.js';
import searchRoutes from './routes/search.js';
import usersRoutes from './routes/users.js';
import adminRoutes from './routes/admin.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure uploads folder exists
const uploadsDir = path.resolve(rootDir, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer storage for file attachments
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${randomUUID()}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static file serving
app.use('/uploads', express.static(uploadsDir));
app.use('/src', express.static(path.resolve(rootDir, 'src')));
app.use('/pages', express.static(path.resolve(rootDir, 'pages')));
app.use(express.static(rootDir));

// File Upload Endpoint
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded.' });
  }
  const fileUrl = `/uploads/${req.file.filename}`;
  res.json({
    url: fileUrl,
    name: req.file.originalname,
    size: req.file.size
  });
});

// Mount API Routes
app.use('/api/auth', authRoutes);
app.use('/api/academic', academicRoutes);
app.use('/api/discussions', discussionsRoutes);
app.use('/api', commentsRoutes); // Comments are mounted at /api/discussions/:id/comments and /api/comments
app.use('/api/communities', communitiesRoutes);
app.use('/api/groups', groupsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/admin', adminRoutes);

// Fallback health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    platform: 'UniCircle',
    timestamp: new Date().toISOString()
  });
});

// Client-side routing fallback for HTML pages
app.get('/', (req, res) => {
  res.sendFile(path.resolve(rootDir, 'index.html'));
});

// Centralized error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: `Upload error: ${err.message}` });
  }
  res.status(500).json({ error: err.message || 'Internal server error occurred.' });
});

app.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(`🎓 UniCircle Server Running!`);
  console.log(`📡 Local URL: http://localhost:${PORT}`);
  console.log(`===============================================`);
});
