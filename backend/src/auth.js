import { betterAuth } from 'better-auth';
import { LibsqlDialect } from '@libsql/kysely-libsql';
import { fileURLToPath } from 'url';
import path from 'path';

let dbUrl = process.env.TURSO_DATABASE_URL;
if (!dbUrl) {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  dbUrl = `file:${path.resolve(__dirname, '../../partner-eval.db')}`;
}

export const auth = betterAuth({
  database: {
    dialect: new LibsqlDialect({
      url: dbUrl,
      authToken: process.env.TURSO_AUTH_TOKEN,
    }),
    type: 'sqlite',
  },
  basePath: '/api/auth',
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL || 'http://localhost:3001',
  trustedOrigins: [
    process.env.BETTER_AUTH_URL || 'http://localhost:5173',
    'http://localhost:5173',
    'http://localhost:3001',
  ],
  emailAndPassword: { enabled: process.env.NODE_ENV !== 'production' },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    },
  },
  session: {
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },
});
