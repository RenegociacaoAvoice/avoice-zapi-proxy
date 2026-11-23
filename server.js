const http = require('http');
const https = require('https');

const PORT = process.env.PORT || 3000;
// Opcional: proteja com uma senha simples definida como variável de ambiente
const SECRET = process.env.PROXY_SECRET || '';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json'
  };
}

const server = http.createServer((req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders());
    return res.end();
  }

  // Rota de saúde
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, corsHeaders());
    return res.end(JSON.stringify({ status: 'ok', service: 'avoice-zapi-proxy' }));
  }

  // Rota de envio
  if (req.method === 'POST' && req.url === '/send') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      let payload;
      try { payload = JSON.parse(body); } catch(e) {
        res.writeHead(400, corsHeaders());
        return res.end(JSON.stringify({ error: 'JSON inválido' }));
      }

      // Verificação de senha (opcional)
      if (SECRET && payload.secret !== SECRET) {
        res.writeHead(401, corsHeaders());
        return res.end(JSON.stringify({ error: 'Não autorizado' }));
      }

      const { zapiUrl, clientToken, phone, message } = payload;

      if (!zapiUrl || !phone || !message) {
        res.writeHead(400, corsHeaders());
        return res.end(JSON.stringify({ error: 'Campos obrigatórios: zapiUrl, phone, message' }));
      }

      // Faz a chamada para a Z-API
      const postData = JSON.stringify({ phone, message });
      const urlObj = new URL(zapiUrl);
      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port || 443,
        path: urlObj.pathname + urlObj.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
          ...(clientToken ? { 'Client-Token': clientToken } : {})
        }
      };

      const zapiReq = https.request(options, zapiRes => {
        let data = '';
        zapiRes.on('data', c => data += c);
        zapiRes.on('end', () => {
          res.writeHead(zapiRes.statusCode, corsHeaders());
          res.end(data);
        });
      });

      zapiReq.on('error', err => {
        res.writeHead(502, corsHeaders());
        res.end(JSON.stringify({ error: err.message }));
      });

      zapiReq.write(postData);
      zapiReq.end();
    });
    return;
  }

  res.writeHead(404, corsHeaders());
  res.end(JSON.stringify({ error: 'Rota não encontrada' }));
});

server.listen(PORT, () => {
  console.log(`Avoice Z-API Proxy rodando na porta ${PORT}`);
});
