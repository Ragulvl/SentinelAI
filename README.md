# SentinelAI - Code Security Scanner

SentinelAI is a web application that helps developers identify, analyze, and remediate security vulnerabilities in their codebases. By integrating directly with GitHub via OAuth and analyzing website targets, it detects flaws and provides automatic patch recommendations.

## Core Features

- GitHub integration using OAuth authentication.
- Automated code vulnerability scanning.
- Live system and target health monitoring.
- Interactive patch editor with side-by-side code diffing.
- Auto-generated pull requests containing suggested security fixes.
- Multi-channel notification alerts (Web Push and WhatsApp).

## Getting Started

### Prerequisites

- Node.js (version 18 or newer)
- npm or yarn package manager
- A GitHub account for repository scanning

### Installation and Setup

1. Clone the repository and navigate into the folder:
   ```bash
   git clone <repository-url>
   cd <project-folder>
   ```

2. Install the frontend dependencies at the root:
   ```bash
   npm install
   ```

3. Install the backend dependencies:
   ```bash
   cd backend
   ```
   ```bash
   npm install
   ```
   ```bash
   cd ..
   ```

4. Create configuration files from the templates:
   ```bash
   # In the root directory (frontend configuration)
   cp .env.example .env

   # In the backend directory (backend configuration)
   cp backend/.env.example backend/.env
   ```

5. Configure your environment files with your custom credentials. For scanning GitHub repositories, you will need to register an OAuth application under your GitHub developer settings.

6. Run the applications in separate terminal windows:

   **Terminal 1 - Backend Server:**
   ```bash
   cd backend
   npm run dev
   ```

   **Terminal 2 - Frontend Client:**
   ```bash
   npm run dev
   ```

7. Once both services are running, open your web browser and go to http://localhost:5173 to access the interface.

## Directory Structure

- **src/**: React frontend client built with Vite and Tailwind CSS.
- **backend/**: Node.js Express server written in TypeScript.
  - **src/controllers/**: Handlers for API endpoints.
  - **src/services/**: Core scanning, AI analysis, database interactions, and integrations.
  - **src/db/models/**: Mongoose schemas representing users, scans, and system states.

## API Endpoints

### Authentication
- `GET /api/auth/github`: Begins the GitHub OAuth flow.
- `GET /api/auth/github/callback`: Receives the OAuth authentication token callback.
- `GET /api/auth/verify`: Validates user authentication using JWT.
- `POST /api/auth/logout`: Clears the user session.

### Scanning & Monitoring
- `GET /health`: Basic server status check.
- `POST /api/scan/start`: Triggers a code scan for a repository.
- `GET /api/scan/status/:scanId`: Polls progress of an active scan.
- `GET /api/scan/results/:scanId`: Retrieves vulnerability reports.

## Configuration Parameters

### Frontend Configuration (.env)
```env
VITE_API_URL=http://localhost:5000
VITE_APP_NAME=SentinelAI
```

### Backend Configuration (backend/.env)
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

## Contributing

We welcome contributions. To get started:
1. Fork this repository.
2. Create a branch for your updates (`git checkout -b feature-name`).
3. Commit your code (`git commit -m 'Implement new feature'`).
4. Push your branch (`git push origin feature-name`).
5. Open a pull request against the main branch.

## License

This software is private and proprietary. Unauthorized copying, distribution, or modifications are prohibited.
