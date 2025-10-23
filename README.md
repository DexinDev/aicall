# AI Call - Voice Assistant for American Developer Group

An intelligent voice assistant built with Twilio, OpenAI, and Google Calendar integration for automated appointment scheduling and customer service.

## 🏗️ Architecture

The application is modularized into focused components:

### Core Modules

- **`app.js`** - Main Express server with route handlers
- **`config.js`** - Environment variables and application constants
- **`voiceHandlers.js`** - Twilio webhook handlers for voice interactions

### Service Modules

- **`aiPlanner.js`** - OpenAI integration for conversation planning and intent recognition
- **`calendar.js`** - Google Calendar API integration for appointment management
- **`timeUtils.js`** - Date/time utilities and natural language processing
- **`tts.js`** - ElevenLabs text-to-speech integration
- **`logger.js`** - Development logging and performance monitoring

## 🚀 Installation

### Prerequisites

- Node.js 18+ 
- Twilio account with phone number
- OpenAI API key
- Google Cloud project with Calendar API enabled
- ElevenLabs API key

### Dependencies

All dependencies are managed via `package.json`:

```bash
npm install
```

**Key Dependencies:**
- `express` - Web server framework
- `twilio` - Voice communication platform
- `googleapis` + `google-auth-library` - Google Calendar integration
- `dotenv` - Environment variable management

### Environment Variables

Create a `.env` file with the following variables:

```env
# Twilio Configuration
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=your_phone_number

# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-4o-mini
OPENAI_BASE_URL=https://api.openai.com/v1/chat/completions

# Google Calendar Configuration
GOOGLE_CLIENT_EMAIL=your_service_account_email
GOOGLE_PRIVATE_KEY=your_private_key
GOOGLE_IMPERSONATE_USER=your_calendar_email
CALENDAR_ID=your_calendar_id

# ElevenLabs Configuration
ELEVENLABS_API_KEY=your_elevenlabs_api_key
ELEVENLABS_VOICE_ID=your_voice_id

# Application Configuration
BASE_URL=https://your-domain.com
BUSINESS_TZ=America/New_York
WORK_START=09:00
WORK_END=18:00
SLOT_MINUTES=60
MIN_BUFFER_MIN=120
```

### Setup

1. **Clone and install:**
   ```bash
   git clone <repository>
   cd aicall
   npm install
   ```

2. **Create audio directory:**
   ```bash
   mkdir -p audio
   ```

3. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your API keys
   ```

4. **Configure Twilio webhooks:**
   - Set voice webhook URL to: `https://your-domain.com/voice`
   - Set gather webhook URL to: `https://your-domain.com/gather`

5. **Start the server:**
   ```bash
   # Production mode
   npm start
   
   # Development mode with detailed logging
   npm run dev
   ```

## 📊 Development Logging

In development mode (`NODE_ENV=development`), the application provides detailed logging for:

### API Performance Monitoring
- **OpenAI API calls** - Request/response times, prompt content, and response parsing
- **ElevenLabs TTS** - Text processing time, audio generation, and file sizes
- **Google Calendar** - Free/busy queries, event creation, and availability checks
- **Twilio interactions** - Call events, speech recognition, and DTMF input

### Log Format
```
🔵 [2024-01-15T10:30:45.123Z] OPENAI
   Action: chat-completions
   Duration: 1250ms
   Prompt: Messages: 3, State: {"name":"John","intent":"remodel"}
   Response: {"action":"ASK","reply":"What's your address?"}
   ⏱️  Total: 1250ms

📞 [2024-01-15T10:30:46.456Z] TWILIO
   Action: gather
   Call SID: CA1234567890
   Speech: "I need a kitchen remodel"
```

### Performance Thresholds
- **OpenAI**: Warning if > 3000ms
- **ElevenLabs**: Warning if > 2000ms  
- **Google Calendar**: Warning if > 2000ms
- **Availability Check**: Warning if > 1000ms

## 🔧 Module Details

### `config.js`
Centralized configuration management including company settings, timezone configuration, and business hours.

### `timeUtils.js`
- Date/time manipulation functions
- Natural language date parsing
- Working hours calculation
- Time slot generation and filtering

### `calendar.js`
- Google Calendar API authentication
- Free/busy time checking
- Appointment booking
- Calendar event management

### `tts.js`
- ElevenLabs API integration
- Text normalization for speech
- Audio file generation and caching

### `aiPlanner.js`
- OpenAI GPT integration
- Conversation state management
- Intent recognition and routing
- Natural language processing for scheduling

### `voiceHandlers.js`
- Twilio TwiML response generation
- Call state management
- Voice interaction flow control
- DTMF and speech input handling

### `logger.js`
- Development logging system
- API performance monitoring
- Twilio event tracking
- Performance threshold warnings

## 📞 Usage

The voice assistant handles:

- **Appointment Scheduling** - Books home visits for 3D scans and estimates
- **Job Inquiries** - Directs to careers page
- **Partnership Requests** - Directs to partners form  
- **General Inquiries** - Provides contact information

## 🛠️ Development

### Project Structure
```
aicall/
├── app.js              # Main Express server
├── config.js           # Configuration management
├── logger.js           # Development logging
├── voiceHandlers.js    # Twilio webhook handlers
├── aiPlanner.js        # OpenAI integration
├── calendar.js         # Google Calendar API
├── timeUtils.js        # Date/time utilities
├── tts.js              # ElevenLabs TTS
├── package.json        # Dependencies & scripts
├── README.md           # Documentation
└── audio/              # Generated audio files
```

### Available Scripts
```bash
npm start    # Production server
npm run dev  # Development with logging
npm test     # Run tests (placeholder)
```

### Development Features
The modular architecture makes it easy to:

- **Add new voice interaction flows** - Extend `voiceHandlers.js`
- **Integrate additional AI services** - Modify `aiPlanner.js`
- **Extend calendar functionality** - Enhance `calendar.js`
- **Customize TTS settings** - Update `tts.js`
- **Add new appointment types** - Extend business logic
- **Monitor performance** - Use built-in logging system

## 📝 License

Private project for American Developer Group.