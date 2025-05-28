// server.js
const express = require('express');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware para parsear JSON
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configuración del transportador de email
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Función para formatear la información de la petición
function formatRequestInfo(req) {
  const timestamp = new Date().toISOString();
  const ip = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
  const fingerprint = req.body?.fingerprint || req.query?.fingerprint || 'No disponible';

  let info = `=== INFORMACIÓN DE PETICIÓN HTTP ===\n\n`;
  info += `Timestamp: ${timestamp}\n`;
  info += `Método: ${req.method}\n`;
  info += `URL: ${req.originalUrl}\n`;
  info += `IP Cliente: ${ip}\n`;
  info += `User-Agent: ${req.get('User-Agent') || 'No disponible'}\n`;
  info += `Fingerprint: ${fingerprint}\n\n`;

  info += `=== TODAS LAS CABECERAS HTTP ===\n\n`;
  Object.entries(req.headers).forEach(([key, value]) => {
    info += `${key}: ${value}\n`;
  });

  info += `\n=== PARÁMETROS DE CONSULTA ===\n\n`;
  if (Object.keys(req.query).length > 0) {
    Object.entries(req.query).forEach(([key, value]) => {
      info += `${key}: ${value}\n`;
    });
  } else {
    info += 'No hay parámetros de consulta\n';
  }

  info += `\n=== CUERPO DE LA PETICIÓN ===\n\n`;
  if (req.body && Object.keys(req.body).length > 0) {
    info += JSON.stringify(req.body, null, 2);
  } else {
    info += 'No hay cuerpo en la petición\n';
  }

  return info;
}

// Función para enviar email
async function sendEmail(requestInfo, req, emailTo = null) {
  const destinationEmail = emailTo ||
    req.query.email ||
    process.env.EMAIL_TO ||
    process.env.EMAIL_USER;

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: destinationEmail,
    subject: `🔍 Nuevo acceso detectado - ${new Date().toLocaleString()}`,
    text: requestInfo,
    html: `
      <div style="font-family: monospace; background-color: #f5f5f5; padding: 20px;">
        <h2 style="color: #333;">🔍 Nueva Petición HTTP Detectada</h2>
        <div style="background-color: white; padding: 15px; border-radius: 5px; border-left: 4px solid #007bff;">
          <pre style="margin: 0; font-size: 12px; overflow-x: auto;">${requestInfo}</pre>
        </div>
        <p style="color: #666; font-size: 12px; margin-top: 15px;">
          Este email fue generado automáticamente por el rastreador de User Agent.
        </p>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Email enviado correctamente a: ${destinationEmail}`);
  } catch (error) {
    console.error('Error enviando email:', error);
  }
}

// Middleware para registrar peticiones
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.originalUrl} - ${req.get('User-Agent')}`);
  next();
});

// Ruta principal de rastreo
app.all('/track', async (req, res) => {
  try {
    const requestInfo = formatRequestInfo(req);
    const emailTo = req.query.email || req.body.email;
    sendEmail(requestInfo, req, emailTo);

    res.status(200).json({
      message: 'Petición registrada correctamente',
      timestamp: new Date().toISOString(),
      userAgent: req.get('User-Agent'),
      ip: req.ip || req.connection.remoteAddress,
      fingerprint: req.body.fingerprint || req.query.fingerprint || null,
      emailSentTo: emailTo || process.env.EMAIL_TO || process.env.EMAIL_USER
    });

  } catch (error) {
    console.error('Error procesando la petición:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Ruta para pixel de seguimiento
app.get('/pixel.png', async (req, res) => {
  try {
    const requestInfo = formatRequestInfo(req);
    const emailTo = req.query.email;
    sendEmail(requestInfo, req, emailTo);

    const pixel = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );

    res.set({
      'Content-Type': 'image/png',
      'Content-Length': pixel.length,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });

    res.send(pixel);

  } catch (error) {
    console.error('Error procesando pixel:', error);
    res.status(500).send('Error');
  }
});

// Página de inicio con script de fingerprint
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>User Agent Tracker</title>
        <meta charset="utf-8">
    </head>
    <body>
        <h1>🔍 Rastreador de User Agent</h1>
        <p>El servidor está funcionando correctamente.</p>
        <h3>Endpoints disponibles:</h3>
        <ul>
            <li><strong>/track</strong> - Endpoint principal para rastreo</li>
            <li><strong>/pixel.png</strong> - Pixel de seguimiento invisible</li>
        </ul>
        <h3>Ejemplos de uso:</h3>
        <p>Para rastrear una visita:</p>
        <code>https://tu-servidor.com/track</code><br>
        <code>https://tu-servidor.com/track?email=destino@gmail.com</code><br><br>
        <p>Pixel invisible:</p>
        <code>&lt;img src="https://tu-servidor.com/pixel.png?email=destino@gmail.com" width="1" height="1" style="display:none;"&gt;</code>
        <p>POST con email:</p>
        <code>POST /track con body: {"email": "destino@gmail.com"}</code>

        <hr>
        <p><small>Tu User-Agent actual: ${req.get('User-Agent')}</small></p>

        <script src="https://cdn.jsdelivr.net/npm/@fingerprintjs/fingerprintjs@3/dist/fp.min.js"></script>
        <script>
          FingerprintJS.load().then(fp => {
            fp.get().then(result => {
              const fingerprint = result.visitorId;

              fetch('/track', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fingerprint: fingerprint })
              }).then(res => res.json())
                .then(data => console.log('Enviado:', data))
                .catch(err => console.error('Error:', err));
            });
          });
        </script>
    </body>
    </html>
  `);
});

// Manejo de errores globales
app.use((error, req, res, next) => {
  console.error('Error global:', error);
  res.status(500).json({ error: 'Error interno del servidor' });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor ejecutándose en puerto ${PORT}`);
  console.log(`📧 Email configurado: ${process.env.EMAIL_USER ? 'Sí' : 'No'}`);
});

module.exports = app;
