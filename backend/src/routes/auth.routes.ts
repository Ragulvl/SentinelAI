import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller.js';

const router = Router();

// Initiate GitHub OAuth flow
router.get('/github', AuthController.initiateGitHubLogin);

// GitHub OAuth callback
router.get('/github/callback', AuthController.handleGitHubCallback);

// Verify JWT token
router.get('/verify', AuthController.verifyToken);

// Bootstrap superadmin — promotes the designated SUPER_ADMIN_GITHUB user (no admin role required)
router.post('/promote-self', AuthController.promoteSelf);

// Logout
router.post('/logout', AuthController.logout);

// Get user repositories
router.get('/repositories', AuthController.getUserRepositories);

// Get repository branches
router.get('/repositories/:owner/:repo/branches', AuthController.getRepositoryBranches);

export default router;
