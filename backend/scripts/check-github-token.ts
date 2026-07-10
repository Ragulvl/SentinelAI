import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { connectDatabase } from '../src/config/database.js';
import { User } from '../src/db/models/User.model.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

async function checkGitHubToken() {
  console.log('🔍 GitHub Token Checker\n');

  try {
    // Connect to database
    await connectDatabase();
    console.log('✅ Connected to database\n');

    // Get user ID from command line or phone number
    const identifier = process.argv[2];
    
    if (!identifier) {
      console.log('Usage:');
      console.log('  npm run check:github 174131904           (by GitHub ID)');
      console.log('  npm run check:github +919025943634       (by phone number)');
      process.exit(1);
    }

    console.log(`Searching for user: ${identifier}\n`);

    // Find user by GitHub ID or phone number
    let user;
    if (identifier.startsWith('+')) {
      user = await User.findOne({ whatsappNumber: identifier });
    } else {
      user = await User.findOne({ githubId: parseInt(identifier) });
    }

    if (!user) {
      console.log('❌ User not found!\n');
      console.log('Make sure the user has:');
      console.log('1. Logged in via GitHub OAuth');
      console.log('2. Registered their WhatsApp number');
      process.exit(1);
    }

    console.log('✅ User found!\n');
    console.log('User Details:');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`GitHub ID:        ${user.githubId}`);
    console.log(`Username:         ${user.username || 'N/A'}`);
    console.log(`Email:            ${user.email || 'N/A'}`);
    console.log(`WhatsApp Number:  ${user.whatsappNumber || 'Not registered'}`);
    console.log(`GitHub Token:     ${user.githubAccessToken ? '✅ EXISTS' : '❌ MISSING'}`);
    console.log(`Token Length:     ${user.githubAccessToken?.length || 0} characters`);
    console.log(`Created:          ${user.createdAt}`);
    console.log(`Last Updated:     ${user.updatedAt}`);
    console.log('═══════════════════════════════════════════════════════\n');

    if (!user.githubAccessToken) {
      console.log('❌ PROBLEM: No GitHub access token found!\n');
      console.log('Why this happens:');
      console.log('─────────────────────────────────────────────────────');
      console.log('1. User logged in but token wasn\'t saved');
      console.log('2. Token expired or was revoked');
      console.log('3. OAuth flow didn\'t complete properly');
      console.log('4. Database migration issue\n');
      
      console.log('How to fix:');
      console.log('─────────────────────────────────────────────────────');
      console.log('1. User needs to log out and log in again');
      console.log('2. Make sure GitHub OAuth is configured correctly');
      console.log('3. Check backend logs during login for errors');
      console.log('4. Verify GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET in .env\n');
      
      console.log('Quick Fix (for testing):');
      console.log('─────────────────────────────────────────────────────');
      console.log('You can manually add a GitHub Personal Access Token:');
      console.log('1. Go to: https://github.com/settings/tokens');
      console.log('2. Generate new token (classic)');
      console.log('3. Select scopes: repo, read:user');
      console.log('4. Run: npm run set:github-token <userId> <token>\n');
    } else {
      console.log('✅ GitHub token exists!\n');
      
      // Test if token is valid
      console.log('Testing token validity...');
      try {
        const axios = (await import('axios')).default;
        const response = await axios.get('https://api.github.com/user', {
          headers: {
            Authorization: `Bearer ${user.githubAccessToken}`,
            Accept: 'application/vnd.github.v3+json',
          },
        });
        
        console.log('✅ Token is VALID!\n');
        console.log('Token Details:');
        console.log('─────────────────────────────────────────────────────');
        console.log(`GitHub Username:  ${response.data.login}`);
        console.log(`Name:             ${response.data.name || 'N/A'}`);
        console.log(`Public Repos:     ${response.data.public_repos}`);
        console.log(`Private Repos:    ${response.data.total_private_repos || 'N/A'}`);
        console.log('─────────────────────────────────────────────────────\n');
        
        console.log('✅ User can use WhatsApp bot for repository scans!');
        
      } catch (error: any) {
        console.log('❌ Token is INVALID or EXPIRED!\n');
        console.log(`Error: ${error.response?.data?.message || error.message}\n`);
        console.log('User needs to log in again to refresh the token.');
      }
    }

    process.exit(0);

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkGitHubToken();
