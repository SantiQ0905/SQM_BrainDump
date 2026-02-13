import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from "@tailwindcss/vite";

/**
 * Dev-only plugin that routes /api/* requests to the Vercel-style
 * serverless handlers in the `api/` directory.
 */
function devApi(): Plugin {
  return {
    name: 'dev-api',
    configureServer(server) {
      // Load ALL env vars from .env.local (not just VITE_* prefixed)
      const env = loadEnv('development', process.cwd(), '');
      Object.assign(process.env, env);

      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next();

        const url = new URL(req.url, `http://${req.headers.host}`);
        const query: Record<string, string> = {};
        url.searchParams.forEach((v, k) => (query[k] = v));

        // e.g. /api/inbox  →  ./api/inbox.ts
        const route = url.pathname.slice(1); // "api/inbox"
        try {
          let mod: any;
          try {
            mod = await server.ssrLoadModule(`./${route}.ts`);
          } catch {
            mod = await server.ssrLoadModule(`./${route}/index.ts`);
          }
          await mod.default(Object.assign(req, { query }), res);
        } catch (e: any) {
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({ error: e?.message ?? 'Handler error' }));
          }
        }
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [devApi(), react(), tailwindcss()],
})
