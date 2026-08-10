import dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';

async function main() {
  await mongoose.connect(process.env.MONGO_URI as string);
  const col = mongoose.connection.collection('verifieddomains');
  const docs = await col.find({}).toArray();
  console.log('=== VERIFIED DOMAINS IN DB ===');
  console.log(JSON.stringify(docs.map(d => ({
    userId: d.userId,
    userIdType: typeof d.userId,
    domain: d.domain,
    verified: d.verified,
    method: d.verificationMethod
  })), null, 2));
  
  // Also check the User collection to see what userId format GitHub users get
  const users = mongoose.connection.collection('users');
  const userDocs = await users.find({}, { projection: { githubId: 1, username: 1 } }).toArray();
  console.log('\n=== USERS (githubId types) ===');
  console.log(JSON.stringify(userDocs.map(u => ({
    githubId: u.githubId,
    githubIdType: typeof u.githubId,
    username: u.username
  })), null, 2));
  
  await mongoose.disconnect();
}
main().catch(console.error);
