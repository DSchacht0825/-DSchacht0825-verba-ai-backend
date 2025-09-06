/**
 * Verba AI Meeting Bot Service
 * Automatically joins Zoom, Teams, Google Meet and transcribes
 */

const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { chromium } = require('playwright');
const cron = require('node-cron');
const winston = require('winston');
const axios = require('axios');
require('dotenv').config();

// Use stealth plugin to avoid detection
puppeteer.use(StealthPlugin());

const app = express();
app.use(express.json());

// Logger setup
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'meeting-bot.log' })
  ]
});

class MeetingBot {
  constructor() {
    this.activeMeetings = new Map();
    this.browser = null;
  }

  /**
   * Join a Zoom meeting
   */
  async joinZoomMeeting(meetingUrl, meetingPassword, botName = 'Verba AI Notetaker') {
    try {
      logger.info(`Joining Zoom meeting: ${meetingUrl}`);
      
      const browser = await puppeteer.launch({
        headless: false, // Set to true in production
        args: [
          '--use-fake-ui-for-media-stream',
          '--use-fake-device-for-media-stream',
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-web-security',
          '--disable-features=IsolateOrigins',
          '--disable-site-isolation-trials'
        ]
      });

      const page = await browser.newPage();
      
      // Grant permissions for microphone and camera
      const context = browser.defaultBrowserContext();
      await context.overridePermissions(meetingUrl, ['microphone', 'camera']);

      // Navigate to Zoom web client
      const webUrl = meetingUrl.replace('zoom.us/j/', 'zoom.us/wc/join/');
      await page.goto(webUrl, { waitUntil: 'networkidle2' });

      // Wait for and fill in the name field
      await page.waitForSelector('input[type="text"]', { timeout: 10000 });
      await page.type('input[type="text"]', botName);

      // Enter password if provided
      if (meetingPassword) {
        await page.waitForSelector('input[type="password"]', { timeout: 5000 });
        await page.type('input[type="password"]', meetingPassword);
      }

      // Click join button
      await page.click('button[class*="join"]');
      
      // Store meeting session
      const meetingId = this.extractMeetingId(meetingUrl);
      this.activeMeetings.set(meetingId, {
        browser,
        page,
        platform: 'zoom',
        startTime: new Date(),
        status: 'active'
      });

      // Start audio capture
      await this.startAudioCapture(page, meetingId);
      
      logger.info(`Successfully joined Zoom meeting: ${meetingId}`);
      return { success: true, meetingId };

    } catch (error) {
      logger.error('Error joining Zoom meeting:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Join a Google Meet meeting
   */
  async joinGoogleMeet(meetingUrl, botName = 'Verba AI Notetaker') {
    try {
      logger.info(`Joining Google Meet: ${meetingUrl}`);
      
      const browser = await chromium.launch({
        headless: false,
        args: ['--use-fake-ui-for-media-stream']
      });

      const context = await browser.newContext({
        permissions: ['microphone', 'camera']
      });
      
      const page = await context.newPage();
      await page.goto(meetingUrl);

      // Dismiss any popups
      try {
        await page.click('button[aria-label="Dismiss"]', { timeout: 3000 });
      } catch (e) {
        // Popup might not exist
      }

      // Enter name
      await page.waitForSelector('input[placeholder*="name" i]', { timeout: 10000 });
      await page.fill('input[placeholder*="name" i]', botName);

      // Turn off camera and microphone
      await page.click('div[role="button"][aria-label*="camera" i]');
      await page.click('div[role="button"][aria-label*="microphone" i]');

      // Click "Ask to join" or "Join now"
      await page.click('button[jsname="Qx7uuf"]');

      const meetingId = this.extractMeetingId(meetingUrl);
      this.activeMeetings.set(meetingId, {
        browser,
        page,
        platform: 'meet',
        startTime: new Date(),
        status: 'active'
      });

      await this.startAudioCapture(page, meetingId);
      
      logger.info(`Successfully joined Google Meet: ${meetingId}`);
      return { success: true, meetingId };

    } catch (error) {
      logger.error('Error joining Google Meet:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Join a Microsoft Teams meeting
   */
  async joinTeamsMeeting(meetingUrl, botName = 'Verba AI Notetaker') {
    try {
      logger.info(`Joining Teams meeting: ${meetingUrl}`);
      
      const browser = await chromium.launch({
        headless: false,
        args: ['--use-fake-ui-for-media-stream']
      });

      const page = await browser.newPage();
      await page.goto(meetingUrl);

      // Choose "Join on the web instead"
      await page.waitForSelector('a[class*="use-web-client"]', { timeout: 10000 });
      await page.click('a[class*="use-web-client"]');

      // Enter name
      await page.waitForSelector('input[placeholder*="name" i]', { timeout: 10000 });
      await page.fill('input[placeholder*="name" i]', botName);

      // Turn off camera and mic
      await page.click('toggle-button[aria-label*="camera" i]');
      await page.click('toggle-button[aria-label*="mic" i]');

      // Join meeting
      await page.click('button[class*="join-btn"]');

      const meetingId = this.extractMeetingId(meetingUrl);
      this.activeMeetings.set(meetingId, {
        browser,
        page,
        platform: 'teams',
        startTime: new Date(),
        status: 'active'
      });

      await this.startAudioCapture(page, meetingId);
      
      logger.info(`Successfully joined Teams meeting: ${meetingId}`);
      return { success: true, meetingId };

    } catch (error) {
      logger.error('Error joining Teams meeting:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Start capturing audio from the meeting
   */
  async startAudioCapture(page, meetingId) {
    // Inject audio capture script
    await page.evaluateOnNewDocument(() => {
      // Capture audio context
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      
      // Override getUserMedia to capture audio
      const originalGetUserMedia = navigator.mediaDevices.getUserMedia;
      navigator.mediaDevices.getUserMedia = async function(constraints) {
        const stream = await originalGetUserMedia.call(this, constraints);
        
        // Send audio data to our server
        if (constraints.audio) {
          const source = audioContext.createMediaStreamSource(stream);
          const processor = audioContext.createScriptProcessor(4096, 1, 1);
          
          processor.onaudioprocess = (e) => {
            const audioData = e.inputBuffer.getChannelData(0);
            // Send to our transcription service
            window.postMessage({
              type: 'AUDIO_DATA',
              data: Array.from(audioData),
              timestamp: Date.now()
            }, '*');
          };
          
          source.connect(processor);
          processor.connect(audioContext.destination);
        }
        
        return stream;
      };
    });

    // Listen for audio data
    page.on('console', async (msg) => {
      if (msg.type() === 'log' && msg.text().includes('AUDIO_DATA')) {
        // Forward to transcription service
        await this.sendToTranscription(meetingId, msg.text());
      }
    });
  }

  /**
   * Send audio to transcription service
   */
  async sendToTranscription(meetingId, audioData) {
    try {
      await axios.post(`${process.env.TRANSCRIPTION_SERVICE_URL}/transcribe`, {
        meetingId,
        audioData,
        timestamp: Date.now()
      });
    } catch (error) {
      logger.error('Error sending audio to transcription:', error);
    }
  }

  /**
   * Leave a meeting
   */
  async leaveMeeting(meetingId) {
    const meeting = this.activeMeetings.get(meetingId);
    if (!meeting) {
      return { success: false, error: 'Meeting not found' };
    }

    try {
      await meeting.browser.close();
      this.activeMeetings.delete(meetingId);
      
      logger.info(`Left meeting: ${meetingId}`);
      return { success: true };
    } catch (error) {
      logger.error('Error leaving meeting:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Extract meeting ID from URL
   */
  extractMeetingId(url) {
    // Extract meeting ID from various URL formats
    const patterns = {
      zoom: /\/j\/(\d+)/,
      meet: /meet\.google\.com\/([a-z\-]+)/,
      teams: /meetup-join\/([^\/]+)/
    };

    for (const [platform, pattern] of Object.entries(patterns)) {
      const match = url.match(pattern);
      if (match) {
        return match[1];
      }
    }

    return url.replace(/[^a-zA-Z0-9]/g, '').substring(0, 20);
  }
}

// Initialize bot
const bot = new MeetingBot();

// API Endpoints
app.post('/api/join-meeting', async (req, res) => {
  const { platform, meetingUrl, password, botName } = req.body;
  
  let result;
  switch (platform.toLowerCase()) {
    case 'zoom':
      result = await bot.joinZoomMeeting(meetingUrl, password, botName);
      break;
    case 'meet':
    case 'google':
      result = await bot.joinGoogleMeet(meetingUrl, botName);
      break;
    case 'teams':
    case 'microsoft':
      result = await bot.joinTeamsMeeting(meetingUrl, botName);
      break;
    default:
      result = { success: false, error: 'Unsupported platform' };
  }

  res.json(result);
});

app.post('/api/leave-meeting', async (req, res) => {
  const { meetingId } = req.body;
  const result = await bot.leaveMeeting(meetingId);
  res.json(result);
});

app.get('/api/active-meetings', (req, res) => {
  const meetings = Array.from(bot.activeMeetings.entries()).map(([id, data]) => ({
    id,
    platform: data.platform,
    startTime: data.startTime,
    status: data.status
  }));
  res.json(meetings);
});

// Calendar Integration for automatic joining
app.post('/api/schedule-bot', async (req, res) => {
  const { meetingUrl, scheduledTime, platform, password } = req.body;
  
  // Schedule bot to join at specified time
  const cronTime = new Date(scheduledTime);
  const cronPattern = `${cronTime.getMinutes()} ${cronTime.getHours()} ${cronTime.getDate()} ${cronTime.getMonth() + 1} *`;
  
  cron.schedule(cronPattern, async () => {
    logger.info(`Scheduled bot joining meeting at ${scheduledTime}`);
    
    switch (platform.toLowerCase()) {
      case 'zoom':
        await bot.joinZoomMeeting(meetingUrl, password);
        break;
      case 'meet':
        await bot.joinGoogleMeet(meetingUrl);
        break;
      case 'teams':
        await bot.joinTeamsMeeting(meetingUrl);
        break;
    }
  });

  res.json({ 
    success: true, 
    message: `Bot scheduled to join at ${scheduledTime}` 
  });
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  logger.info(`Meeting bot service running on port ${PORT}`);
});