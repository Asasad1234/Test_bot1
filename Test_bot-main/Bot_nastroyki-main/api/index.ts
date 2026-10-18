import app from '../server';

export default function handler(req: any, res: any) {
  // Normalize req.url for Vercel serverless functions
  // When rewritten via vercel.json /api/(.*) -> /api, ensure Express receives full /api path
  if (req && req.url) {
    if (!req.url.startsWith('/api') && !req.url.startsWith('/index.html')) {
      req.url = '/api' + (req.url.startsWith('/') ? req.url : '/' + req.url);
    }
  }
  return app(req, res);
}

