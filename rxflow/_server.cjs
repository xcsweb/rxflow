// 临时静态服务器：用于本地验证 demo
const http = require('http');
const fs = require('fs');
const path = require('path');
const root = __dirname;
const mime = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json' };
const port = Number(process.env.PORT) || 5173;
http.createServer((req, res) => {
  let p = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (p.endsWith(path.sep)) p = path.join(p, 'index.html');
  fs.readFile(p, (err, data) => {
    if (err) { res.writeHead(404); res.end('404: '+req.url); return; }
    res.writeHead(200, {'Content-Type': mime[path.extname(p)] || 'text/plain'});
    res.end(data);
  });
}).listen(port, () => console.log(`Demo: http://localhost:${port}/demo/`));
