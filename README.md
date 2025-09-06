# Verba AI Backend - Clinical Documentation Services

The backend services for Verba AI's HIPAA-compliant clinical documentation platform, providing real-time transcription, AI note generation, and meeting bot automation.

## 🚀 Services Overview

### **Audio Service** (Port 4000)
- **Real-time transcription** using Deepgram API
- **AI note generation** with OpenAI GPT-4
- **Clinical templates**: SOAP, DAP, BIRP, GIRP
- **WebSocket support** for live communication
- **Speaker diarization** and risk detection

### **Meeting Bot Service** (Port 5001)  
- **Automatic meeting joining**: Zoom, Google Meet, Microsoft Teams
- **Browser automation** using Puppeteer/Playwright
- **Calendar integration** support
- **Fathom-like functionality** for seamless workflow

## 🛠️ Tech Stack

- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **AI Services**: OpenAI GPT-4, Deepgram
- **Browser Automation**: Puppeteer, Playwright
- **WebSocket**: Socket.io for real-time communication
- **Logging**: Winston with structured logs
- **Security**: HIPAA-compliant data handling

## 🏗️ Project Structure

```
├── audio-service/           # Real-time transcription & AI notes
│   ├── src/
│   │   └── server.js       # Main audio processing server
│   ├── package.json        # Dependencies & scripts
│   └── .env.example        # Environment template
├── meeting-bot/             # Meeting automation service  
│   ├── src/
│   │   └── index.js        # Meeting bot orchestrator
│   ├── package.json        # Bot dependencies
│   └── .env.example        # Environment template
└── README.md               # This file
```

## 🔧 Setup & Installation

### Prerequisites
- Node.js 18+
- npm or yarn
- OpenAI API key
- Deepgram API key

### Environment Setup

**Audio Service `.env`:**
```env
OPENAI_API_KEY=your_openai_api_key_here
DEEPGRAM_API_KEY=your_deepgram_api_key_here
PORT=4000
NODE_ENV=production
```

**Meeting Bot Service `.env`:**
```env  
PORT=5001
TRANSCRIPTION_SERVICE_URL=http://localhost:4000
NODE_ENV=production
```

### Installation & Start

```bash
# Install Audio Service dependencies
cd audio-service
npm install
npm start

# Install Meeting Bot dependencies  
cd ../meeting-bot
npm install
npm start
```

## 🌐 API Documentation

### Audio Service (Port 4000)

#### WebSocket Events
- **Connection**: `socket.on('connect')`
- **Audio Data**: `socket.emit('audio-chunk', audioBlob)`
- **Transcription**: `socket.on('transcription', data)`
- **Note Generation**: `socket.on('clinical-note', note)`

#### REST Endpoints
- `POST /upload-audio` - Upload audio file for processing
- `GET /transcriptions/:sessionId` - Get transcription results
- `POST /generate-notes` - Generate clinical notes from transcription
- `GET /health` - Service health check

### Meeting Bot Service (Port 5001)

#### REST Endpoints
- `POST /api/join-meeting` - Join Zoom/Teams/Meet automatically
- `POST /api/leave-meeting` - Leave active meeting
- `GET /api/active-meetings` - List active meeting bots
- `POST /api/schedule-bot` - Schedule automatic joining
- `GET /health` - Service health check

#### Request Examples

**Join Meeting:**
```bash
curl -X POST http://localhost:5001/api/join-meeting \
  -H "Content-Type: application/json" \
  -d '{
    "platform": "zoom",
    "meetingUrl": "https://zoom.us/j/123456789",
    "password": "optional_password",
    "botName": "Verba AI Assistant"
  }'
```

**Get Active Meetings:**
```bash
curl http://localhost:5001/api/active-meetings
```

## 🚀 Deployment Options

### **Option 1: Heroku**
```bash
# Create Heroku apps
heroku create your-app-audio-service
heroku create your-app-meeting-bot

# Set environment variables
heroku config:set OPENAI_API_KEY=your_key -a your-app-audio-service
heroku config:set DEEPGRAM_API_KEY=your_key -a your-app-audio-service

# Deploy
git subtree push --prefix=audio-service heroku-audio main
git subtree push --prefix=meeting-bot heroku-meeting main
```

### **Option 2: Railway**
```bash
# Install Railway CLI
npm install -g @railway/cli

# Deploy audio service
cd audio-service
railway login
railway init
railway up

# Deploy meeting bot
cd ../meeting-bot  
railway init
railway up
```

### **Option 3: DigitalOcean App Platform**
- Create new app from GitHub repository
- Set build commands for each service
- Configure environment variables
- Deploy with auto-scaling

### **Option 4: AWS/Docker**
```dockerfile
# Example Dockerfile for audio-service
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 4000
CMD ["npm", "start"]
```

## 🔒 Security & Compliance

### HIPAA Compliance Features
- **Data Encryption**: All audio/text data encrypted in transit and at rest
- **Access Controls**: API key authentication required
- **Audit Logging**: All requests logged with timestamps
- **Data Retention**: Configurable retention policies
- **PHI Handling**: Secure processing of protected health information

### Security Best Practices
- Environment variables for sensitive data
- HTTPS/WSS in production
- Rate limiting and input validation
- No data persistence without encryption
- Regular security audits

## 📊 Monitoring & Health Checks

Both services include health check endpoints:
```bash
curl http://localhost:4000/health  # Audio service
curl http://localhost:5001/health  # Meeting bot service
```

Health checks verify:
- Service uptime and connectivity
- API key validity
- WebSocket connection status
- Browser automation readiness

## 🔧 Development

### Local Development
```bash
# Start both services in development mode
npm run dev  # Audio service (with nodemon)
npm start    # Meeting bot service
```

### Testing
```bash
# Test audio service
curl -X POST http://localhost:4000/health

# Test meeting bot
curl http://localhost:5001/api/active-meetings
```

## 📝 Logging

Both services use Winston for structured logging:
- **INFO**: Service startup, API requests
- **WARN**: Invalid requests, rate limits  
- **ERROR**: Service failures, API errors
- **DEBUG**: Detailed request/response data

Logs are formatted as JSON for easy parsing and monitoring.

## 🚨 Troubleshooting

### Common Issues

**Audio Service:**
- Check OpenAI/Deepgram API keys are valid
- Verify WebSocket connections aren't blocked by firewall
- Ensure sufficient memory for audio processing

**Meeting Bot:**
- Verify browser dependencies are installed
- Check meeting URLs are accessible
- Confirm platform-specific authentication

### Support
- **GitHub Issues**: Use this repository for bug reports
- **Documentation**: Check API examples above
- **Email**: support@verba-ai.com

---

## 🎯 Production Ready

Both services are **production-ready** with:
✅ Real AI transcription and note generation  
✅ Automated meeting joining (Zoom/Teams/Meet)  
✅ HIPAA-compliant security architecture  
✅ Comprehensive error handling and logging  
✅ Health checks and monitoring endpoints  
✅ Environment-based configuration  

**Deploy to your preferred platform and update frontend API URLs!**