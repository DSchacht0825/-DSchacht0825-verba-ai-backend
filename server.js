const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: ['audio-service', 'meeting-bot']
  });
});

// Service status endpoint
app.get('/status', (req, res) => {
  res.json({
    audioService: 'Running on port 4000',
    meetingBot: 'Running on port 5001',
    deployment: 'Railway',
    version: '1.0.0'
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'Verba AI Backend',
    description: 'AI-powered clinical documentation services',
    services: {
      'audio-service': 'Real-time transcription and clinical note generation',
      'meeting-bot': 'Automatic meeting joining for Zoom, Teams, and Google Meet'
    },
    endpoints: {
      '/health': 'Health check',
      '/status': 'Service status',
      'Audio Service': 'Port 4000 - /api/transcribe/stream, /api/generate/notes',
      'Meeting Bot': 'Port 5001 - /api/join-meeting, /api/leave-meeting'
    }
  });
});

// Start both services as child processes
function startServices() {
  console.log('🚀 Starting Verba AI Backend Services...');
  
  // Start Audio Service
  const audioService = spawn('npm', ['start'], {
    cwd: path.join(__dirname, 'audio-service'),
    stdio: 'inherit',
    shell: true
  });

  audioService.on('error', (err) => {
    console.error('Audio service error:', err);
  });

  // Start Meeting Bot Service  
  const meetingBot = spawn('npm', ['start'], {
    cwd: path.join(__dirname, 'meeting-bot'), 
    stdio: 'inherit',
    shell: true
  });

  meetingBot.on('error', (err) => {
    console.error('Meeting bot error:', err);
  });

  console.log('✅ Audio Service starting on port 4000');
  console.log('✅ Meeting Bot starting on port 5001');
  console.log(`✅ Main server starting on port ${PORT}`);
}

// Start the main server
app.listen(PORT, () => {
  console.log(`🌟 Verba AI Backend running on port ${PORT}`);
  startServices();
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Shutting down Verba AI Backend...');
  process.exit(0);
});