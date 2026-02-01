const express = require("express");
const app = express();
const axios = require("axios");
const os = require('os');
const fs = require("fs");
const path = require("path");
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);

// --- 环境变量配置 ---
const UPLOAD_URL = process.env.UPLOAD_URL || '';
const PROJECT_URL = process.env.PROJECT_URL || '';
const AUTO_ACCESS = process.env.AUTO_ACCESS || false;
const FILE_PATH = process.env.FILE_PATH || './tmp';
const SUB_PATH = process.env.SUB_PATH || 'sub';
const PORT = process.env.SERVER_PORT || process.env.PORT || 3000;
const UUID = process.env.UUID || '9afd1229-b893-40c1-84dd-51e7ce204913';
const NEZHA_SERVER = process.env.NEZHA_SERVER || '';
const NEZHA_PORT = process.env.NEZHA_PORT || '';
const NEZHA_KEY = process.env.NEZHA_KEY || '';
// 已修复：去掉了多余的单引号
const ARGO_DOMAIN = process.env.ARGO_DOMAIN || 'beyoundtime.dpdns.org';
const ARGO_AUTH = process.env.ARGO_AUTH || '';
const ARGO_PORT = process.env.ARGO_PORT || 8001;
const CFIP = process.env.CFIP || 'cdns.doon.eu.org';
const CFPORT = process.env.CFPORT || 443;
const NAME = process.env.NAME || '';

// --- 基础工具函数 ---
if (!fs.existsSync(FILE_PATH)) fs.mkdirSync(FILE_PATH, { recursive: true });

function generateRandomName() {
  const characters = 'abcdefghijklmnopqrstuvwxyz';
  let result = '';
  for (let i = 0; i < 6; i++) result += characters.charAt(Math.floor(Math.random() * characters.length));
  return result;
}

const npmName = generateRandomName(), webName = generateRandomName(), botName = generateRandomName(), phpName = generateRandomName();
let npmPath = path.join(FILE_PATH, npmName), phpPath = path.join(FILE_PATH, phpName), webPath = path.join(FILE_PATH, webName), botPath = path.join(FILE_PATH, botName);
let subPath = path.join(FILE_PATH, 'sub.txt'), configPath = path.join(FILE_PATH, 'config.json'), bootLogPath = path.join(FILE_PATH, 'boot.log');

// --- 1. 生成 XHTTP 配置文件 (全面适配新版 Xray) ---
async function generateConfig() {
  const config = {
    log: { access: '/dev/null', error: '/dev/null', loglevel: 'none' },
    inbounds: [
      { 
        port: ARGO_PORT, 
        protocol: 'vless', 
        settings: { clients: [{ id: UUID, flow: 'xtls-rprx-vision' }], decryption: 'none', fallbacks: [{ dest: 3001 }, { path: "/vless-argo", dest: 3002 }, { path: "/vmess-argo", dest: 3003 }, { path: "/trojan-argo", dest: 3004 }] }, 
        streamSettings: { network: 'tcp' } 
      },
      { port: 3001, listen: "127.0.0.1", protocol: "vless", settings: { clients: [{ id: UUID }], decryption: "none" }, streamSettings: { network: "tcp" } },
      // XHTTP 核心设置
      { port: 3002, listen: "127.0.0.1", protocol: "vless", settings: { clients: [{ id: UUID, level: 0 }], decryption: "none" }, streamSettings: { network: "xhttp", xhttpSettings: { mode: "packet", path: "/vless-argo" } } },
      { port: 3003, listen: "127.0.0.1", protocol: "vmess", settings: { clients: [{ id: UUID, alterId: 0 }] }, streamSettings: { network: "xhttp", xhttpSettings: { mode: "packet", path: "/vmess-argo" } } },
      { port: 3004, listen: "127.0.0.1", protocol: "trojan", settings: { clients: [{ password: UUID }] }, streamSettings: { network: "xhttp", xhttpSettings: { mode: "packet", path: "/trojan-argo" } } },
    ],
    dns: { servers: ["8.8.8.8"] },
    outbounds: [{ protocol: "freedom", tag: "direct" }, { protocol: "blackhole", tag: "block" }]
  };
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

// --- 2. 运行逻辑与文件下载 ---
function getSystemArchitecture() {
  const arch = os.arch();
  return (arch === 'arm' || arch === 'arm64' || arch === 'aarch64') ? 'arm' : 'amd';
}

async function downloadFilesAndRun() {
  const arch = getSystemArchitecture();
  const files = [
    { fileName: webPath, fileUrl: `https://${arch}64.ssss.nyc.mn/web` },
    { fileName: botPath, fileUrl: `https://${arch}64.ssss.nyc.mn/bot` }
  ];

  if (NEZHA_SERVER && NEZHA_KEY) {
    const nzUrl = NEZHA_PORT ? `https://${arch}64.ssss.nyc.mn/agent` : `https://${arch}64.ssss.nyc.mn/v1`;
    files.unshift({ fileName: NEZHA_PORT ? npmPath : phpPath, fileUrl: nzUrl });
  }

  for (const file of files) {
    const writer = fs.createWriteStream(file.fileName);
    const response = await axios({ method: 'get', url: file.fileUrl, responseType: 'stream' });
    response.data.pipe(writer);
    await new Promise((resolve) => writer.on('finish', resolve));
    fs.chmodSync(file.fileName, 0o775);
    console.log(`Downloaded: ${path.basename(file.fileName)}`);
  }

  // 启动核心进程
  if (NEZHA_SERVER && NEZHA_KEY) {
    if (NEZHA_PORT) {
      const tls = ['443', '8443', '2096', '2087', '2083', '2053'].includes(NEZHA_PORT) ? '--tls' : '';
      exec(`nohup ${npmPath} -s ${NEZHA_SERVER}:${NEZHA_PORT} -p ${NEZHA_KEY} ${tls} --report-delay 4 --skip-conn --skip-procs >/dev/null 2>&1 &`);
    } else {
      const configYaml = `client_secret: ${NEZHA_KEY}\nserver: ${NEZHA_SERVER}\ntls: true\nuuid: ${UUID}`;
      fs.writeFileSync(path.join(FILE_PATH, 'config.yaml'), configYaml);
      exec(`nohup ${phpPath} -c "${FILE_PATH}/config.yaml" >/dev/null 2>&1 &`);
    }
  }

  exec(`nohup ${webPath} -c ${configPath} >/dev/null 2>&1 &`);

  const argoArgs = ARGO_AUTH.match(/^[A-Z0-9a-z=]{120,250}$/) ? `tunnel --no-autoupdate run --token ${ARGO_AUTH}` :
                   `tunnel --edge-ip-version auto --no-autoupdate --protocol http2 --logfile ${bootLogPath} --url http://localhost:${ARGO_PORT}`;
  exec(`nohup ${botPath} ${argoArgs} >/dev/null 2>&1 &`);
}

// --- 3. 生成订阅链接 ---
async function generateLinks(argoDomain) {
  const nodeName = NAME || 'Cloudflare-Argo';
  const VMESS = { v: '2', ps: nodeName, add: CFIP, port: CFPORT, id: UUID, aid: '0', scy: 'none', net: 'xhttp', type: 'packet', host: argoDomain, path: '/vmess-argo', tls: 'tls', sni: argoDomain, alpn: 'h2,http/1.1', fp: 'firefox' };
  
  const subTxt = `vless://${UUID}@${CFIP}:${CFPORT}?encryption=none&security=tls&sni=${argoDomain}&fp=firefox&type=xhttp&mode=packet&host=${argoDomain}&path=%2Fvless-argo#${nodeName}\n\nvmess://${Buffer.from(JSON.stringify(VMESS)).toString('base64')}\n\ntrojan://${UUID}@${CFIP}:${CFPORT}?security=tls&sni=${argoDomain}&fp=firefox&type=xhttp&mode=packet&host=${argoDomain}&path=%2Ftrojan-argo#${nodeName}`;

  fs.writeFileSync(subPath, Buffer.from(subTxt).toString('base64'));
  app.get(`/${SUB_PATH}`, (req, res) => {
    res.set('Content-Type', 'text/plain; charset=utf-8');
    res.send(Buffer.from(subTxt).toString('base64'));
  });
  console.log("--------------------------");
  console.log("订阅内容已生成 (Base64):");
  console.log(Buffer.from(subTxt).toString('base64'));
  console.log("--------------------------");
}

// --- 启动主函数 ---
async function start() {
  await generateConfig();
  await downloadFilesAndRun();
  // 等待 Argo 域名生成
  setTimeout(async () => {
    if (ARGO_AUTH && ARGO_DOMAIN) {
      await generateLinks(ARGO_DOMAIN);
    } else if (fs.existsSync(bootLogPath)) {
      const content = fs.readFileSync(bootLogPath, 'utf-8');
      const match = content.match(/https?:\/\/([^ ]*trycloudflare\.com)/);
      if (match) await generateLinks(match[1]);
    }
  }, 10000);
}

app.get("/", (req, res) => res.send("Hello world!"));
app.listen(PORT, () => console.log(`Server is running on port: ${PORT}`));
start().catch(console.error);

// 90秒后清理二进制文件
setTimeout(() => {
  const files = [webPath, botPath, phpPath, npmPath, configPath, bootLogPath].join(' ');
  exec(`rm -f ${files} >/dev/null 2>&1`);
}, 90000);
