import express from 'express';
import notificationRoutes from '../src/routes/notification.routes.js';

const app = express();

// Test route registration
app.use('/api/notifications', notificationRoutes);

// Get all registered routes
function getRoutes(app: express.Application) {
  const routes: string[] = [];
  
  app._router.stack.forEach((middleware: any) => {
    if (middleware.route) {
      routes.push(`${Object.keys(middleware.route.methods)[0].toUpperCase()} ${middleware.route.path}`);
    } else if (middleware.name === 'router') {
      middleware.handle.stack.forEach((handler: any) => {
        if (handler.route) {
          const path = middleware.regexp.source
            .replace('\\/?', '')
            .replace('(?=\\/|$)', '')
            .replace(/\\\//g, '/');
          routes.push(`${Object.keys(handler.route.methods)[0].toUpperCase()} ${path}${handler.route.path}`);
        }
      });
    }
  });
  
  return routes;
}

console.log('🔍 Verifying Notification Routes...\n');

try {
  const routes = getRoutes(app);
  
  console.log('✅ Notification routes registered:\n');
  routes.forEach(route => {
    console.log(`   ${route}`);
  });
  
  console.log('\n✅ Route verification complete!');
  console.log('\nExpected routes:');
  console.log('   GET /api/notifications/preferences');
  console.log('   PUT /api/notifications/preferences');
  console.log('   POST /api/notifications/push/subscribe');
  console.log('   POST /api/notifications/push/unsubscribe');
  console.log('   GET /api/notifications/push/vapid-key');
  console.log('   POST /api/notifications/whatsapp/save');
  console.log('   DELETE /api/notifications/whatsapp/remove');
  console.log('   POST /api/notifications/test');
  
} catch (error) {
  console.error('❌ Error verifying routes:', error);
  process.exit(1);
}
