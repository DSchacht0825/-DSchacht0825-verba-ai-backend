const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const multer = require('multer');
const { createClient } = require('@deepgram/sdk');
const OpenAI = require('openai');
const cors = require('cors');
const helmet = require('helmet');
const winston = require('winston');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

// Logger setup
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
    new winston.transports.Console()
  ]
});

// Initialize AI services
const deepgram = createClient(process.env.DEEPGRAM_API_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Storage for active sessions
const activeSessions = new Map();

// Multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['audio/wav', 'audio/mp3', 'audio/m4a', 'audio/webm'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only audio files allowed.'));
    }
  }
});

// Real-time transcription endpoint
app.post('/api/transcribe/stream', upload.single('audio'), async (req, res) => {
  try {
    const sessionId = req.body.sessionId || uuidv4();
    const audioBuffer = req.file.buffer;
    
    logger.info(`Starting transcription for session: ${sessionId}`);

    // Use Deepgram for real-time transcription
    const { result, error } = await deepgram.listen.prerecorded.transcribeFile(
      audioBuffer,
      {
        model: 'nova-2',
        language: 'en-US',
        smart_format: true,
        diarize: true,
        punctuate: true,
        numerals: true,
        timestamps: true,
        speaker_labels: true
      }
    );

    if (error) {
      logger.error('Deepgram transcription error:', error);
      return res.status(500).json({ error: 'Transcription failed' });
    }

    const transcription = {
      sessionId,
      transcript: result.results.channels[0].alternatives[0].transcript,
      words: result.results.channels[0].alternatives[0].words,
      speakers: extractSpeakers(result.results.channels[0].alternatives[0].words),
      timestamp: new Date().toISOString()
    };

    // Store session data
    if (!activeSessions.has(sessionId)) {
      activeSessions.set(sessionId, {
        id: sessionId,
        startTime: new Date(),
        transcripts: [],
        speakers: new Set()
      });
    }

    const session = activeSessions.get(sessionId);
    session.transcripts.push(transcription);
    
    // Emit to connected clients
    io.to(`session_${sessionId}`).emit('transcription', transcription);

    res.json({
      success: true,
      sessionId,
      transcription
    });

  } catch (error) {
    logger.error('Transcription error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Generate clinical notes from session
app.post('/api/generate/notes', async (req, res) => {
  try {
    const { sessionId, noteType = 'SOAP', clientInfo = {} } = req.body;
    
    if (!activeSessions.has(sessionId)) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const session = activeSessions.get(sessionId);
    const fullTranscript = session.transcripts
      .map(t => `[${t.timestamp}] ${t.transcript}`)
      .join('\n');

    logger.info(`Generating ${noteType} notes for session: ${sessionId}`);

    // Generate clinical notes using GPT-4
    const prompt = createClinicalNotePrompt(noteType, fullTranscript, clientInfo);
    
    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: 'You are a HIPAA-compliant clinical documentation AI assistant specializing in mental health therapy notes. Generate professional, objective, behaviorally anchored clinical notes.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: 2000
    });

    const clinicalNote = {
      sessionId,
      noteType,
      content: completion.choices[0].message.content,
      generatedAt: new Date().toISOString(),
      wordCount: completion.choices[0].message.content.split(' ').length,
      clientInfo,
      sessionDuration: calculateSessionDuration(session)
    };

    // Store the generated note
    session.clinicalNote = clinicalNote;

    res.json({
      success: true,
      note: clinicalNote
    });

  } catch (error) {
    logger.error('Note generation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Socket.IO for real-time communication
io.on('connection', (socket) => {
  logger.info(`Client connected: ${socket.id}`);

  socket.on('join_session', (sessionId) => {
    socket.join(`session_${sessionId}`);
    logger.info(`Client ${socket.id} joined session: ${sessionId}`);
    
    // Send existing session data if available
    if (activeSessions.has(sessionId)) {
      const session = activeSessions.get(sessionId);
      socket.emit('session_data', {
        sessionId,
        transcripts: session.transcripts,
        speakers: Array.from(session.speakers)
      });
    }
  });

  socket.on('disconnect', () => {
    logger.info(`Client disconnected: ${socket.id}`);
  });
});

// Helper functions
function extractSpeakers(words) {
  const speakers = {};
  words.forEach(word => {
    if (word.speaker !== undefined) {
      if (!speakers[word.speaker]) {
        speakers[word.speaker] = [];
      }
      speakers[word.speaker].push({
        word: word.word,
        start: word.start,
        end: word.end,
        confidence: word.confidence
      });
    }
  });
  return speakers;
}

function createClinicalNotePrompt(noteType, transcript, clientInfo) {
  const basePrompt = `
Generate a professional ${noteType} clinical note based on the following therapy session transcript.

Client Information:
- Name: ${clientInfo.name || 'Client'}
- Date of Birth: ${clientInfo.dob || 'Not provided'}
- Session Date: ${new Date().toLocaleDateString()}
- Session Type: ${clientInfo.sessionType || 'Individual Therapy'}

Session Transcript:
${transcript}

Requirements:
- Use objective, behaviorally anchored language
- Maintain HIPAA compliance
- Include relevant clinical observations
- Avoid subjective interpretations
- Follow ${noteType} format structure
- Include risk assessment if applicable
- Suggest treatment plan elements
`;

  return basePrompt;
}

function calculateSessionDuration(session) {
  const startTime = new Date(session.startTime);
  const endTime = new Date();
  const duration = Math.round((endTime - startTime) / (1000 * 60)); // minutes
  return `${duration} minutes`;
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    activeSessions: activeSessions.size
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  logger.info(`Audio service running on port ${PORT}`);
});