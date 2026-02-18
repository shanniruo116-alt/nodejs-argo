const { createProxyMiddleware } = require('http-proxy-middleware');
const express = require("express");
const app = express();
const axios = require("axios");
const os = require('os');
const fs = require("fs");
const path = require("path");
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);

// --- 基础配置区 ---
const PROJECT_URL = process.env.PROJECT_URL || 'beyoundtime-production-8b80.up.railway.app';
const FILE_PATH = process.env.FILE_PATH || './tmp';
const SUB_PATH = process.env.SUB_PATH || 'sub';
const PORT = process.env.PORT || 8080; 
const UUID = process.env.UUID || 'eb7d51ee-3ef8-4545-94db-346146706ce9';
const ARGO_DOMAIN = process.env.ARGO_DOMAIN || 'beyoundtime-production-8b80.up.railway.app';
const CFIP = process.env.CFIP || 'beyoundtime-production-8b80.up.railway.app';
const CFPORT = 443;
const NAME = process.env.NAME || 'beyoundtime';

// --- 文件路径定义 ---
if (!fs.existsSync(FILE_PATH)) fs.mkdirSync(FILE_PATH, { recursive: true });
const webPath = path.join(FILE_PATH, 'web');
const configPath = path.join(FILE_PATH, 'config.json');

// --- 根路由 ---
app.get("/", (req, res) => res.send("Server is running!"));

// --- 核心反向代理逻辑 ---
// 针对不同协议使用不同的转发规则，确保 WS 握手成功
function createWsProxy(path, targetPort) {
    return createProxyMiddleware(path, {
        target: `http://127.0.0.1:${targetPort}`,
        ws: true,
        changeOrigin: true,
        onProxyReqWs: (proxyReq) => {
            proxyReq.setHeader('Host', ARGO_DOMAIN);
        },
        logLevel: 'warn'
    });
}

// 路由分发 (改用 40000+ 端口避让)
app.use(createWsProxy('/vless-argo', 40002));
app.use(createWsProxy('/vmess-argo', 40003));
app.use(createWsProxy('/trojan-argo', 40004));

// --- 生成 Xray 配置 ---
async function generateConfig() {
    const config = {
        log: { access: '/dev/null', error: '/dev/null', loglevel: 'none' },
        inbounds: [
            { 
                port: 40002, listen: "127.0.0.1", protocol: "vless", 
                settings: { clients: [{ id: UUID }], decryption: "none" }, 
                streamSettings: { network: "ws", wsSettings: { path: "/vless-argo" } } 
            },
            { 
                port: 40003, listen: "127.0.0.1", protocol: "vmess", 
                settings: { clients: [{ id: UUID, alterId: 0 }] }, 
                streamSettings: { network: "ws", wsSettings: { path: "/vmess-argo" } } 
            },
            { 
                port: 40004, listen: "127.0.0.1", protocol: "trojan", 
                settings: { clients: [{ password: UUID }] }, 
                streamSettings: { network: "ws", wsSettings: { path: "/trojan-argo" } } 
            }
        ],
        outbounds: [{ protocol: "freedom", tag: "direct" }]
    };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

// --- 下载核心 ---
async function downloadFiles() {
    const arch = os.arch().includes('arm') ? 'arm64' : 'amd64';
    const url = `https://${arch}.ssss.nyc.mn/web`;
    const response = await axios({ method: 'get', url: url, responseType: 'stream' });
    const writer = fs.createWriteStream(webPath);
    response.data.pipe(writer);
    return new Promise((resolve, reject) => {
        writer.on('finish', () => {
            fs.chmodSync(webPath, 0o775);
            resolve();
        });
        writer.on('error', reject);
    });
}

// --- 生成订阅链接 ---
async function generateLinks() {
    const commonQuery = `sni=${ARGO_DOMAIN}&type=ws&host=${ARGO_DOMAIN}`;
    
    // 生成节点链接
    const vlessLink = `vless://${UUID}@${CFIP}:${CFPORT}?encryption=none&security=tls&${commonQuery}&path=%2Fvless-argo#${NAME}-Vless`;
    
    const VMESS_OBJ = { v: '2', ps: `${NAME}-Vmess`, add: CFIP, port: CFPORT, id: UUID, aid: '0', scy: 'none', net: 'ws', type: 'none', host: ARGO_DOMAIN, path: '/vmess-argo', tls: 'tls', sni: ARGO_DOMAIN };
    const vmessLink = `vmess://${Buffer.from(JSON.stringify(VMESS_OBJ)).toString('base64')}`;
    
    const trojanLink = `trojan://${UUID}@${CFIP}:${CFPORT}?security=tls&${commonQuery}&path=%2Ftrojan-argo#${NAME}-Trojan`;
    
    const subContent = Buffer.from(`${vlessLink}\n${vmessLink}\n${trojanLink}`).toString('base64');
    
    app.get(`/${SUB_PATH}`, (req, res) => {
        res.set('Content-Type', 'text/plain; charset=utf-8');
        res.send(subContent);
    });
    console.log(`[OK] 订阅地址: https://${PROJECT_URL}/${SUB_PATH}`);
}

async function startserver() {
    try {
        await generateConfig();
        await downloadFiles();
        await generateLinks();
        // 运行核心
        exec(`${webPath} -c ${configPath}`);
        console.log('[OK] Xray 核心运行中...');
    } catch (error) {
        console.error('[Error] 启动失败:', error.message);
    }
}

app.listen(PORT, () => {
    console.log(`[OK] Server started on port ${PORT}`);
    startserver();
});
