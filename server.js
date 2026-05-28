const http = require('http');
const fs = require('fs');
const path = require('path');

const port = Number(process.env.PORT) || 3000;
const root = __dirname;
const dataDir = process.env.DATA_DIR || path.join(root, 'data');
const dataFile = path.join(dataDir, 'projects.json');
const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.ico': 'image/x-icon'
};

function readProjects() {
  try {
    const raw = fs.readFileSync(dataFile, 'utf8');
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('Failed to read projects', error);
    return [];
  }
}

function writeProjects(projects) {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(dataFile, JSON.stringify(projects, null, 2), 'utf8');
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        req.destroy();
        reject(new Error('Request body too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-cache'
  });
  res.end(JSON.stringify(payload));
}

function normalizeProject(item, index) {
  return {
    id: String(item.id || `project-${Date.now()}-${index + 1}`),
    department: String(item.department || '').trim(),
    project_name: String(item.project_name || '').trim(),
    url: String(item.url || '#').trim() || '#'
  };
}

async function handleProjectsApi(req, res) {
  try {
    if (req.method === 'GET') {
      sendJson(res, 200, { projects: readProjects() });
      return;
    }

    if (req.method === 'POST') {
      const body = await readJsonBody(req);
      const projects = readProjects();
      const project = normalizeProject(body, projects.length);
      if (!project.department || !project.project_name) {
        sendJson(res, 400, { error: 'department and project_name are required' });
        return;
      }
      if (projects.length >= 999) {
        sendJson(res, 400, { error: 'limit reached' });
        return;
      }
      projects.push(project);
      writeProjects(projects);
      sendJson(res, 200, { project, projects });
      return;
    }

    if (req.method === 'PUT') {
      const body = await readJsonBody(req);
      const incoming = Array.isArray(body.projects) ? body.projects : [];
      const projects = incoming.slice(0, 999).map(normalizeProject).filter(item => item.department && item.project_name);
      writeProjects(projects);
      sendJson(res, 200, { projects });
      return;
    }

    if (req.method === 'DELETE') {
      writeProjects([]);
      sendJson(res, 200, { projects: [] });
      return;
    }

    sendJson(res, 405, { error: 'method not allowed' });
  } catch (error) {
    console.error('Projects API failed', error);
    sendJson(res, 500, { error: 'server error' });
  }
}

function sendFile(res, filePath) {
  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': contentTypes[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable'
    });
    res.end(data);
  });
}

http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname === '/api/projects') {
    handleProjectsApi(req, res);
    return;
  }

  const requestedPath = decodeURIComponent(url.pathname);
  const filePath = requestedPath === '/'
    ? path.join(root, 'index.html')
    : path.join(root, requestedPath);

  if (!filePath.startsWith(root)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (error, stats) => {
    if (!error && stats.isFile()) {
      sendFile(res, filePath);
      return;
    }
    sendFile(res, path.join(root, 'index.html'));
  });
}).listen(port, () => {
  console.log(`MONNN Control Center listening on ${port}`);
});
