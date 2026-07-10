# SentinelAI - Automated Security Auditing System

SentinelAI is a developer-centric security tool designed to detect, analyze, and resolve code vulnerabilities. By connecting to repositories via GitHub OAuth and monitoring external target URLs, the system identifies potential security risks and produces validated code patches.

## Key Capabilities

- OAuth-based GitHub repository integration
- Automated static code analysis and dependency checking
- Continuous target monitoring and availability validation
- Side-by-side patch editing and review interface
- Automated pull request generation for security updates
- Native notification alerts through Web Push and SMS/WhatsApp channels

## Getting Started

### System Requirements

- Node.js version 18.0.0 or higher
- npm or yarn package manager
- A GitHub developer account for repository integration

### Setup and Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd <project-folder>
   ```

2. Retrieve and install dependencies for the frontend client:
   ```bash
   npm install
   ```

3. Retrieve and install dependencies for the backend service:
   ```bash
   cd backend
   npm install
   cd ..
   ```

4. Create configuration profiles:
   ```bash
   # Root directory (frontend environment configuration)
   cp .env.example .env

   # Backend directory (backend environment configuration)
   cp backend/.env.example backend/.env
   ```

5. Configure your environmental settings in both files. For repository analysis, establish an OAuth application under your GitHub developer settings.

6. Launch both application components:

   **Terminal 1 - Core Backend Server:**
   ```bash
   cd backend
   npm run dev
   ```

   **Terminal 2 - Frontend Client Application:**
   ```bash
   npm run dev
   ```

7. Access the interface at `http://localhost:5173`.

## Architecture Overview

- **src/**: React client app compiled with Vite and styled via Tailwind CSS.
- **backend/**: Express-based Node.js application built in TypeScript.
  - **src/controllers/**: Direct handlers for API endpoints.
  - **src/services/**: Core logic engines covering AI audits, scanning runs, database mappings, and messaging providers.
  - **src/db/models/**: Mongoose schemas representing users, historical scans, and target metrics.

## API Specification

### User Authorization
- `GET /api/auth/github`: Initiates the GitHub OAuth redirect.
- `GET /api/auth/github/callback`: Processes the authentication code from GitHub.
- `GET /api/auth/verify`: Confirms user session integrity via JWT.
- `POST /api/auth/logout`: Invalidates the active session.

### Vulnerability Management
- `GET /health`: Core server operational status.
- `POST /api/scan/start`: Schedules a vulnerability check for a selected repository.
- `GET /api/scan/status/:scanId`: Returns progress details for an ongoing analysis.
- `GET /api/scan/results/:scanId`: Retrieves vulnerability findings.

## Configuration Parameters

### Frontend Client (.env)
```env
VITE_API_URL=http://localhost:5000
VITE_APP_NAME=SentinelAI
```

### Backend Service (backend/.env)
```env
PORT=5000
FRONTEND_URL=http://localhost:5173
MONGO_URI=mongodb://localhost:27017/sentinelai
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
GITHUB_CALLBACK_URL=http://localhost:5000/api/auth/github/callback
JWT_SECRET=your_jwt_secret
JWT_EXPIRES_IN=7d
NODE_ENV=development
```

## Contributing Guidelines

1. Fork this repository.
2. Open a feature branch (`git checkout -b feature-branch-name`).
3. Commit your updates (`git commit -m 'Add specific feature'`).
4. Push your changes (`git push origin feature-branch-name`).
5. Open a pull request against the default branch.

## License

This project is private and proprietary. Unauthorized distribution, modification, or copy of this software is strictly prohibited.
