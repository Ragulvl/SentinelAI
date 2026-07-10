# SentinelAI Backend Service

This service acts as the orchestration and API backend for SentinelAI, a web application designed to run security code audits and monitor external endpoints. The backend coordinates GitHub OAuth authorization, schedules repository scanners, performs AI-assisted evaluations, processes notification events, and persists scan histories in MongoDB.

## Features

- OAuth authentication flow and access token management for GitHub integration
- JWT-based authorization and session verification
- MongoDB database integration for tracking users, logs, and historical checks
- Scheduled checking routines for endpoint health and responsiveness
- TypeScript-based architecture

## Getting Started

### 1. Install Dependencies
```bash
cd backend
npm install
```

### 2. Database Setup

The backend service connects to a MongoDB database. You can start it locally in one of two ways:

**Option A: Local Service Installation**
- Download MongoDB Community Server: https://www.mongodb.com/try/download/community
- Install and start the service according to the OS instructions.

**Option B: Containerized Database via Docker**
```bash
docker run -d -p 27017:27017 --name mongodb-local mongo:latest
```

### 3. GitHub OAuth Application Configuration

To enable repository access, configure an OAuth application on GitHub:
1. Go to Settings > Developer settings > OAuth Apps in your GitHub account settings.
2. Select "Register a new application".
3. Configure the parameters:
   - Application Name: SentinelAI
   - Homepage URL: http://localhost:5173
   - Authorization Callback URL: http://localhost:5000/api/auth/github/callback
4. Save the application, retrieve the Client ID, and generate a new Client Secret.

### 4. Environmental Configuration

Establish your local settings by creating a `.env` file:
```bash
cp .env.example .env
```

Open the newly created `.env` file and supply your configurations:
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

### 5. Start the Application

Run the server with hot-reloading enabled for development:
```bash
npm run dev
```

On successful startup, you should see logs confirming database connection and service initialization:
```text
Connecting to MongoDB...
MongoDB connected successfully
Database: sentinelai
Backend server running on http://localhost:5000
```

## Directory Structure

- **src/config/**: Settings parser and database connection initialization.
- **src/controllers/**: Express handlers executing request-response lifecycles.
- **src/db/models/**: Mongoose database schemas mapping scans, targets, and users.
- **src/middleware/**: Custom request interceptors, including route authentication guards.
- **src/routes/**: Definition of endpoint patterns and HTTP methods.
- **src/services/**: Core operational logic, wrapping AI prompts, scanning pipelines, and external integrations.
- **scripts/**: Support scripts for database testing, notifications, and key generation.

## Primary Endpoints

### Authorization
- `GET /api/auth/github`: Begins OAuth sequence.
- `GET /api/auth/github/callback`: Receives GitHub callback values.
- `GET /api/auth/verify`: Validates JWT session credentials.
- `POST /api/auth/logout`: Clears active session.

### Operations
- `GET /health`: Returns basic health status.
