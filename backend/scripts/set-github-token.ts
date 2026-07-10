import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { connectDatabase } from '../src/config/database.js';
import { User } from '../src/db/models/User.model.js';
import axios from 'axios';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

async function setGitHubToken() {
  console.log('🔧 GitHub Token Setter\n');

  try {
    // Get arguments
    const userId = process.argv[2];
    const token = process.argv[3];

    if (!userId || !token) {
      console.log('Usage: npm run set:github-token <userId> <token>\n');
      console.log('Example:');
      console.log('  npm run set:github-token 174131904 ghp_xxxxxxxxxxxx\n');
      console.log('To get a token:');
      console.log('1. Go to: https://github.com/settings/tokens');
      console.log('2. Click "Generate new token (classic)"');
      console.log('3. Select scopes: repo, read:user, user:email');
      console.log('4. Generate and copy the token');
      process.exit(1);
    }

    // Connect to database
    await connectDatabase();
    console.log('✅ Connected to database\n');

    // Find user
    const user = await User.findOne({ githubId: parseInt(userId) });

    if (!user) {
      console.log(`❌ User with GitHub ID ${userId} not found!\n`);
      console.log('Make sure the user has logged in at least once.');
      process.exit(1);
    }

    console.log(`Found user: ${user.username || user.githubId}\n`);

    // Validate token first
    console.log('Validating token...');
    try {
      const response = await axios.get('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      });

      console.log('✅ Token is valid!\n');
      console.log('Token Details:');
      console.log('─────────────────────────────────────────────────────');
      console.log(`GitHub Username:  ${response.data.login}`);
      console.log(`Name:             ${response.data.name || 'N/A'}`);
      console.log(`Email:            ${response.data.email || 'N/A'}`);
      console.log(`Public Repos:     ${response.data.public_repos}`);
      console.log('─────────────────────────────────────────────────────\n');

      // Update user
      user.githubAccessToken = token;
      
      // Update username and email if they don't exist
      if (!user.username) {
        user.username = response.data.login;
      }
      if (!user.email) {
        user.email = response.data.email;
      }

      await user.save();

      console.log('✅ Token saved successfully!\n');
      console.log('User can now:');
      console.log('• Use WhatsApp bot for repository scans');
      console.log('• Scan private repositories');
      console.log('• Access all GitHub features\n');

    } catch (error: any) {
      console.log('❌ Token validation failed!\n');
      console.log(`Error: ${error.response?.data?.message || error.message}\n`);
      console.log('Please check:');
      console.log('1. Token is correct (starts with ghp_ or github_pat_)');
      console.log('2. Token has required scopes (repo, read:user)');
      console.log('3. Token is not expired');
      process.exit(1);
    }

    process.exit(0);

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

setGitHubToken();
