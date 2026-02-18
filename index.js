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
if (!fs.existsSync(FILE_PATH)) fs.mkdirSync(FILE_PATH);
const webPath = path.join(FILE_PATH, 'web');
const subPath = path.join(FILE_PATH, 'sub.txt');
const configPath = path.join(FILE_PATH, 'config.json');

// --- 根路由 ---
app.get("/", (req, res) => res.send("Server is running!"));

// --- 反向代理增强配置 ---
// 必须透传 Headers，否则 Vless/Trojan 握手会失败
const proxyOption = {
    target: `http://127.0.0.1:3000`, // 统一转发到 Xray 监听端口
    ws: true,
    changeOrigin: true,
    onProxyReqWs: (proxyReq, req, socket) => {
        proxyReq.setHeader('Host', ARGO_DOMAIN);
    },
    logLevel: 'warn'
};

// 路由分发
app.use('/vless-argo', createProxyMiddleware({ ...proxyOption, target: `http://127.0.0.1:3002` }));
app.use('/vmess-argo', createProxyMiddleware({ ...proxyOption, target: `http://127.0.0.1:3003` }));
app.use('/trojan-argo', createProxyMiddleware({ ...proxyOption, target: `http://127.0.0.1:3004` }));

// --- 生成 Xray 配置 ---
async function generateConfig() {
    const config = {
        log: { access: '/dev/null', error: '/dev/null', loglevel: 'none' },
        inbounds: [
            // Vless WS
            { 
                port: 3002, listen: "127.0.0.1", protocol: "vless", 
                settings: { clients: [{ id: UUID }], decryption: "none" }, 
                streamSettings: { network: "ws", wsSettings: { path: "/vless-argo" } } 
            },
            // Vmess WS
            { 
                port: 3003, listen: "127.0.0.1", protocol: "vmess", 
                settings: { clients: [{ id: UUID, alterId: 0 }] }, 
                streamSettings: { network: "ws", wsSettings: { path: "/vmess-argo" } } 
            },
            // Trojan WS
            { 
                port: 3004, listen: "127.0.0.1", protocol: "trojan", 
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
    const nodeName = NAME;
    const commonQuery = `sni=${ARGO_DOMAIN}&type=ws&host=${ARGO_DOMAIN}`;
    
    const vlessLink = `vless://${UUID}@${CFIP}:${CFPORT}?encryption=none&security=tls&${commonQuery}&path=%2Fvless-argo%3Fed%3D2048#${nodeName}`;
    
    const VMESS_OBJ = { v: '2', ps: nodeName, add: CFIP, port: CFPORT, id: UUID, aid: '0', scy: 'none', net: 'ws', type: 'none', host: ARGO_DOMAIN, path: '/vmess-argo?ed=2048', tls: 'tls', sni: ARGO_DOMAIN };
    const vmessLink = `vmess://${Buffer.from(JSON.stringify(VMESS_OBJ)).toString('base64')}`;
    
    const trojanLink = `trojan://${UUID}@${CFIP}:${CFPORT}?security=tls&${commonQuery}&path=%2Ftrojan-argo%3Fed%3D2048#${nodeName}`;
    
    const subContent = Buffer.from(`${vlessLink}\n${vmessLink}\n${trojanLink}`).toString('base64');
    
    app.get(`/${SUB_PATH}`, (req, res) => {
        res.set('Content-Type', 'text/plain; charset=utf-8');
        res.send(subContent);
    });
    console.log(`[OK] 订阅路由注册成功: /${SUB_PATH}`);
}

async function startserver() {
    try {
        await generateConfig();
        await downloadFiles();
        await generateLinks();
        // 启动核心，移除 nohup 的日志丢弃，方便调试
        exec(`${webPath} -c ${configPath}`);
        console.log('[OK] Xray 核心已启动');
    } catch (error) {
        console.error('[Error] 启动失败:', error.message);
    }
}

app.listen(PORT, () => {
    console.log(`[OK] HTTP Server 运行在端口: ${PORT}`);
    startserver();
});
