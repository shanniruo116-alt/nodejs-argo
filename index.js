const express = require("express");
const app = express();
const axios = require("axios");
const os = require('os');
const fs = require("fs");
const path = require("path");
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);
const { execSync } = require('child_process');

// 环境变量配置
const UPLOAD_URL = process.env.UPLOAD_URL || '';
const PROJECT_URL = process.env.PROJECT_URL || 'https://google.com';
const AUTO_ACCESS = process.env.AUTO_ACCESS || true;
const FILE_PATH = process.env.FILE_PATH || './tmp';
const SUB_PATH = process.env.SUB_PATH || 'sub';
const PORT = process.env.SERVER_PORT || process.env.PORT || 3000;
const UUID = process.env.UUID || 'eb7db1ee-3ef8-4545-94db-346146706ce9';
const NEZHA_SERVER = process.env.NEZHA_SERVER || '';
const NEZHA_PORT = process.env.NEZHA_PORT || '';
const NEZHA_KEY = process.env.NEZHA_KEY || '';
const ARGO_DOMAIN = process.env.ARGO_DOMAIN || ''beyoundtime.dpdns.org';
const ARGO_AUTH = process.env.ARGO_AUTH || 'eyJhIjoiNjJlNWQ5MjQ5ZWRhYmVhMTA3YjU0ODQxYmRkZTlkYjIiLCJ0IjoiMTY1MDJjMTEtYjdmMi00Mzk4LTkxYzktODM3NzUzYTJiYjFjIiwicyI6Ik1tWmhObVZtTm1ZdE5EVTJOeTAwT1dJekxXSXpaRFF0WmpJM01UVXlZek0wWWpJdyJ9';
const ARGO_PORT = process.env.ARGO_PORT || 28766;
const CFIP = process.env.CFIP || ''beyoundtime.dpdns.org';
const CFPORT = process.env.CFPORT || 443;
const NAME = process.env.NAME || 'beyoundtime';

// 基础目录创建
if (!fs.existsSync(FILE_PATH)) fs.mkdirSync(FILE_PATH, { recursive: true });

function generateRandomName() {
  const characters = 'abcdefghijklmnopqrstuvwxyz';
  let result = '';
  for (let i = 0; i < 6; i++) result += characters.charAt(Math.floor(Math.random() * characters.length));
  return result;
}

const npmName = generateRandomName(), webName = generateRandomName(), botName = generateRandomName(), phpName = generateRandomName();
let npmPath = path.join(FILE_PATH, npmName), phpPath = path.join(FILE_PATH, phpName), webPath = path.join(FILE_PATH, webName), botPath = path.join(FILE_PATH, botName);
let subPath = path.join(FILE_PATH, 'sub.txt'), listPath = path.join(FILE_PATH, 'list.txt'), bootLogPath = path.join(FILE_PATH, 'boot.log'), configPath = path.join(FILE_PATH, 'config.json');

// --- 核心修正：生成 XHTTP 配置文件 ---
async function generateConfig() {
  const config = {
    log: { access: '/dev/null', error: '/dev/null', loglevel: 'none' },
    inbounds: [
      { port: ARGO_PORT, protocol: 'vless', settings: { clients: [{ id: UUID, flow: 'xtls-rprx-vision' }], decryption: 'none', fallbacks: [{ dest: 3001 }, { path: "/vless-argo", dest: 3002 }, { path: "/vmess-argo", dest: 3003 }, { path: "/trojan-argo", dest: 3004 }] }, streamSettings: { network: 'tcp' } },
      { port: 3001, listen: "127.0.0.1", protocol: "vless", settings: { clients: [{ id: UUID }], decryption: "none" }, streamSettings: { network: "tcp" } },
      // VLESS XHTTP
      { port: 3002, listen: "127.0.0.1", protocol: "vless", settings: { clients: [{ id: UUID, level: 0 }], decryption: "none" }, streamSettings: { network: "xhttp", xhttpSettings: { mode: "packet", path: "/vless-argo" } } },
      // VMESS XHTTP
      { port: 3003, listen: "127.0.0.1", protocol: "vmess", settings: { clients: [{ id: UUID, alterId: 0 }] }, streamSettings: { network: "xhttp", xhttpSettings: { mode: "packet", path: "/vmess-argo" } } },
      // Trojan XHTTP
      { port: 3004, listen: "127.0.0.1", protocol: "trojan", settings: { clients: [{ password: UUID }] }, streamSettings: { network: "xhttp", xhttpSettings: { mode: "packet", path: "/trojan-argo" } } },
    ],
    dns: { servers: ["8.8.8.8"] },
    outbounds: [{ protocol: "freedom", tag: "direct" }, { protocol: "blackhole", tag: "block" }]
  };
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

// --- 核心修正：生成 XHTTP 节点链接 ---
async function generateLinks(argoDomain) {
  const ISP = await getMetaInfo();
  const nodeName = NAME ? `${NAME}-${ISP}` : ISP;
  return new Promise((resolve) => {
    setTimeout(() => {
      // 这里的 net 改为 xhttp, type 改为 packet
      const VMESS = { v: '2', ps: `${nodeName}`, add: CFIP, port: CFPORT, id: UUID, aid: '0', scy: 'none', net: 'xhttp', type: 'packet', host: argoDomain, path: '/vmess-argo', tls: 'tls', sni: argoDomain, alpn: 'h2,http/1.1', fp: 'firefox' };
      
      const subTxt = `
vless://${UUID}@${CFIP}:${CFPORT}?encryption=none&security=tls&sni=${argoDomain}&fp=firefox&type=xhttp&mode=packet&host=${argoDomain}&path=%2Fvless-argo#${nodeName}

vmess://${Buffer.from(JSON.stringify(VMESS)).toString('base64')}

trojan://${UUID}@${CFIP}:${CFPORT}?security=tls&sni=${argoDomain}&fp=firefox&type=xhttp&mode=packet&host=${argoDomain}&path=%2Ftrojan-argo#${nodeName}
      `.trim();

      console.log("---------- Base64 Sub Content ----------");
      console.log(Buffer.from(subTxt).toString('base64'));
      console.log("----------------------------------------");
      
      fs.writeFileSync(subPath, Buffer.from(subTxt).toString('base64'));
      uploadNodes();
      app.get(`/${SUB_PATH}`, (req, res) => {
        res.set('Content-Type', 'text/plain; charset=utf-8');
        res.send(Buffer.from(subTxt).toString('base64'));
      });
      resolve(subTxt);
    }, 2000);
  });
}

function getSystemArchitecture() {
  const arch = os.arch();
  if (arch === 'arm' || arch === 'arm64' || arch === 'aarch64') return 'arm';
  return 'amd';
}

function downloadFile(fileName, fileUrl, callback) {
  const writer = fs.createWriteStream(fileName);
  axios({ method: 'get', url: fileUrl, responseType: 'stream' })
    .then(response => {
      response.data.pipe(writer);
      writer.on('finish', () => {
        writer.close();
        console.log(`Download ${path.basename(fileName)} successfully`);
        callback(null, fileName);
      });
      writer.on('error', err => {
        fs.unlink(fileName, () => {});
        callback(`Download failed: ${err.message}`);
      });
    })
    .catch(err => callback(`Download failed: ${err.message}`));
}

function getFilesForArchitecture(architecture) {
  let baseFiles = architecture === 'arm' 
    ? [{ fileName: webPath, fileUrl: "https://arm64.ssss.nyc.mn/web" }, { fileName: botPath, fileUrl: "https://arm64.ssss.nyc.mn/bot" }]
    : [{ fileName: webPath, fileUrl: "https://amd64.ssss.nyc.mn/web" }, { fileName: botPath, fileUrl: "https://amd64.ssss.nyc.mn/bot" }];

  if (NEZHA_SERVER && NEZHA_KEY) {
    const nzUrl = NEZHA_PORT 
      ? (architecture === 'arm' ? "https://arm64.ssss.nyc.mn/agent" : "https://amd64.ssss.nyc.mn/agent")
      : (architecture === 'arm' ? "https://arm64.ssss.nyc.mn/v1" : "https://amd64.ssss.nyc.mn/v1");
    baseFiles.unshift({ fileName: NEZHA_PORT ? npmPath : phpPath, fileUrl: nzUrl });
  }
  return baseFiles;
}

// --- 进程授权与运行 ---
async function downloadFilesAndRun() {
  const architecture = getSystemArchitecture();
  const filesToDownload = getFilesForArchitecture(architecture);
  
  for (const file of filesToDownload) {
    await new Promise((resolve, reject) => {
      downloadFile(file.fileName, file.fileUrl, (err) => err ? reject(err) : resolve());
    });
  }

  const filesToAuth = NEZHA_PORT ? [npmPath, webPath, botPath] : [phpPath, webPath, botPath];
  filesToAuth.forEach(f => { if (fs.existsSync(f)) fs.chmodSync(f, 0o775); });

  // 运行哪吒
  if (NEZHA_SERVER && NEZHA_KEY) {
    if (!NEZHA_PORT) {
      const port = NEZHA_SERVER.includes(':') ? NEZHA_SERVER.split(':').pop() : '';
      const nezhatls = ['443', '8443', '2096', '2087', '2083', '2053'].includes(port) ? 'true' : 'false';
      const configYaml = `client_secret: ${NEZHA_KEY}\nserver: ${NEZHA_SERVER}\ntls: ${nezhatls}\nuuid: ${UUID}\ndebug: false`;
      fs.writeFileSync(path.join(FILE_PATH, 'config.yaml'), configYaml);
      exec(`nohup ${phpPath} -c "${FILE_PATH}/config.yaml" >/dev/null 2>&1 &`);
    } else {
      const tls = ['443', '8443', '2096', '2087', '2083', '2053'].includes(NEZHA_PORT) ? '--tls' : '';
      exec(`nohup ${npmPath} -s ${NEZHA_SERVER}:${NEZHA_PORT} -p ${NEZHA_KEY} ${tls} --report-delay 4 --skip-conn --skip-procs >/dev/null 2>&1 &`);
    }
  }

  // 运行 Xray
  exec(`nohup ${webPath} -c ${configPath} >/dev/null 2>&1 &`);

  // 运行 Argo 隧道
  let argoArgs = ARGO_AUTH.match(/^[A-Z0-9a-z=]{120,250}$/) ? `tunnel --no-autoupdate run --token ${ARGO_AUTH}` : 
                 ARGO_AUTH.includes('TunnelSecret') ? `tunnel --config ${FILE_PATH}/tunnel.yml run` :
                 `tunnel --edge-ip-version auto --no-autoupdate --protocol http2 --logfile ${bootLogPath} --url http://localhost:${ARGO_PORT}`;
  exec(`nohup ${botPath} ${argoArgs} >/dev/null 2>&1 &`);
}

// --- 隧道域名提取与基础信息 ---
async function extractDomains() {
  if (ARGO_AUTH && ARGO_DOMAIN) return await generateLinks(ARGO_DOMAIN);
  
  let attempts = 0;
  const checkLog = async () => {
    try {
      if (fs.existsSync(bootLogPath)) {
        const content = fs.readFileSync(bootLogPath, 'utf-8');
        const match = content.match(/https?:\/\/([^ ]*trycloudflare\.com)/);
        if (match) return await generateLinks(match[1]);
      }
    } catch (e) {}
    if (attempts++ < 10) {
      await new Promise(r => setTimeout(r, 3000));
      return await checkLog();
    }
    console.log("Argo domain not found in logs.");
  };
  await checkLog();
}

async function getMetaInfo() {
  try {
    const res = await axios.get('http://ip-api.com/json/', { timeout: 3000 });
    return res.data.status === 'success' ? `${res.data.countryCode}_${res.data.org.split(' ')[0]}` : 'Unknown';
  } catch (e) { return 'Unknown'; }
}

function argoType() {
  if (ARGO_AUTH.includes('TunnelSecret')) {
    fs.writeFileSync(path.join(FILE_PATH, 'tunnel.json'), ARGO_AUTH);
    const yaml = `tunnel: ${ARGO_AUTH.split('"')[11]}\ncredentials-file: ${path.join(FILE_PATH, 'tunnel.json')}\ningress:\n  - hostname: ${ARGO_DOMAIN}\n    service: http://localhost:${ARGO_PORT}\n  - service: http_status:404`;
    fs.writeFileSync(path.join(FILE_PATH, 'tunnel.yml'), yaml);
  }
}

async function AddVisitTask() {
  if (AUTO_ACCESS && PROJECT_URL) {
    try {
      await axios.post('https://oooo.serv00.net/add-url', { url: PROJECT_URL }, { timeout: 5000 });
      console.log(`Automatic access task added`);
    } catch (e) {}
  }
}

// --- 启动与清理 ---
async function startserver() {
  console.log("Starting server...");
  argoType();
  await generateConfig();
  await downloadFilesAndRun();
  await extractDomains();
  await AddVisitTask();
}

// 90秒后清理二进制文件以节省空间并增强隐蔽性
setTimeout(() => {
  const files = [bootLogPath, configPath, webPath, botPath, phpPath, npmPath];
  const cmd = process.platform === 'win32' ? `del /f /q ${files.join(' ')}` : `rm -f ${files.join(' ')}`;
  exec(`${cmd} >/dev/null 2>&1`, () => {
    console.clear();
    console.log('App is running. Thank you for using this script!');
  });
}, 90000);

startserver().catch(console.error);
app.listen(PORT, () => console.log(`Server on port ${PORT}`));
