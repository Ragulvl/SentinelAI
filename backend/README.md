# SentinelAI Backend

This is the backend server for the SentinelAI security scanning application. It manages GitHub OAuth authentication, schedules scans, processes AI code audits, triggers web-hook notifications, and records security history in MongoDB.

## Features

- GitHub OAuth authentication and access token exchange.
- JSON Web Token (JWT) user authorization.
- MongoDB tracking for user preferences, target histories, and logs.
- Automated API endpoints for scanning and system diagnostics.
- Full TypeScript implementation.

## Quick Start

### 1. Install Dependencies
```bash
cd backend
npm install
```

### 2. Database Installation

To run this backend locally, you will need a running MongoDB database instance.

**Option A: Install MongoDB Locally**
- Download MongoDB Community Server: https://www.mongodb.com/try/download/community
- Follow instructions for your operating system to start the service.

**Option B: Start with Docker**
```bash
docker run -d -p 27017:27017 --name mongodb-local mongo:latest
```

To test the database connection, you can run:
```bash
npm run test:mongodb
```

### 3. GitHub OAuth Setup

To support repository scanning, configure a GitHub OAuth app:
1. Navigate to Settings > Developer settings > OAuth Apps in GitHub.
2. Select "New OAuth App".
3. Provide the following values:
   - Application Name: SentinelAI
   - Homepage URL: http://localhost:5173
   - Authorization Callback URL: http://localhost:5000/api/auth/github/callback
4. Register the app, copy the Client ID, and generate a new Client Secret.

### 4. Environment Configuration

Create a local configuration file:
```bash
cp .env.example .env
```

Open `.env` and fill in your custom values:
```env
PORT=5000
FRONTEND_URL=http://localhost:5173
MONGO_URI=mongodb://localhost:27017/sentinelai
GITHUB_CLIENT_ID=your_client_id
GITHUB_CLIENT_SECRET=your_client_secret
GITHUB_CALLBACK_URL=http://localhost:5000/api/auth/github/callback
JWT_SECRET=your_secret_token
JWT_EXPIRES_IN=7d
NODE_ENV=development
```

### 5. Running the Server

Start the development hot-reloading server:
```bash
npm run dev
```

Upon successful startup, the server output will confirm the database connection:
```text
Connecting to MongoDB...
MongoDB connected successfully
Database: sentinelai
Backend server running on http://localhost:5000
```

## Folder Structure

- **src/config/**: Environment and database connection configurations.
- **src/controllers/**: Express route handlers managing user requests.
- **src/db/models/**: Mongoose models representing the data models (Users, Scans, Site Checks, etc.).
- **src/middleware/**: Express middleware functions, including authentication validators.
- **src/routes/**: Definition of web API endpoints.
- **src/services/**: Scanning engines, AI prompts, WhatsApp worker routines, and GitHub integrations.
- **scripts/**: Utility files for database checks and initial keys creation.

## Primary API Routes

### Authentication
- `GET /api/auth/github`: Begins the OAuth flow.
- `GET /api/auth/github/callback`: Receives the OAuth authentication token callback.
- `GET /api/auth/verify`: Validates user authentication using JWT.
- `POST /api/auth/logout`: Clears the user session.

### Health Check
- `GET /health`: Basic server status check.
