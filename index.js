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
const UUID = process.env.UUID || 'eb7db1ee-3ef8-4545-94db-346146706ce9';
const ARGO_DOMAIN = process.env.ARGO_DOMAIN || 'node.beyoundtime-production-8b80.up.railway.app';
const ARGO_PORT = 28766; 
const CFIP = process.env.CFIP || 'node.beyoundtime-production-8b80.up.railway.app';
const CFPORT = 443;
const NAME = process.env.NAME || 'beyoundtime';

// --- 文件路径定义 ---
if (!fs.existsSync(FILE_PATH)) fs.mkdirSync(FILE_PATH);
const webPath = path.join(FILE_PATH, 'web');
const subPath = path.join(FILE_PATH, 'sub.txt');
const configPath = path.join(FILE_PATH, 'config.json');

// --- 根路由与反向代理 ---
app.get("/", (req, res) => res.send("Server is running!"));

// 关键：将流量转发给 Xray 的 WebSocket 端口
app.use('/vless-argo', createProxyMiddleware({ target: `http://127.0.0.1:3002`, ws: true, changeOrigin: true }));
app.use('/vmess-argo', createProxyMiddleware({ target: `http://127.0.0.1:3003`, ws: true, changeOrigin: true }));
app.use('/trojan-argo', createProxyMiddleware({ target: `http://127.0.0.1:3004`, ws: true, changeOrigin: true }));

// --- 生成 Xray 配置 ---
async function generateConfig() {
    const config = {
        log: { access: '/dev/null', error: '/dev/null', loglevel: 'none' },
        inbounds: [
            { port: ARGO_PORT, protocol: 'vless', settings: { clients: [{ id: UUID }], decryption: 'none', fallbacks: [{ dest: 3001 }, { path: "/vless-argo", dest: 3002 }, { path: "/vmess-argo", dest: 3003 }, { path: "/trojan-argo", dest: 3004 }] }, streamSettings: { network: 'tcp' } },
            { port: 3001, listen: "127.0.0.1", protocol: "vless", settings: { clients: [{ id: UUID }], decryption: "none" }, streamSettings: { network: "tcp" } },
            { port: 3002, listen: "127.0.0.1", protocol: "vless", settings: { clients: [{ id: UUID }], decryption: "none" }, streamSettings: { network: "ws", wsSettings: { path: "/vless-argo" } } },
            { port: 3003, listen: "127.0.0.1", protocol: "vmess", settings: { clients: [{ id: UUID, alterId: 0 }] }, streamSettings: { network: "ws", wsSettings: { path: "/vmess-argo" } } },
            { port: 3004, listen: "127.0.0.1", protocol: "trojan", settings: { clients: [{ password: UUID }] }, streamSettings: { network: "ws", wsSettings: { path: "/trojan-argo" } } }
        ],
        outbounds: [{ protocol: "freedom", tag: "direct" }]
    };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

// --- 下载核心 ---
async function downloadFiles() {
    const arch = os.arch().includes('arm') ? 'arm64' : 'amd64';
    const url = `https://${arch}.ssss.nyc.mn/web`;
    console.log(`Downloading from: ${url}`);
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
    const VMESS = { v: '2', ps: nodeName, add: CFIP, port: CFPORT, id: UUID, aid: '0', scy: 'none', net: 'ws', type: 'none', host: ARGO_DOMAIN, path: '/vmess-argo?ed=2560', tls: 'tls', sni: ARGO_DOMAIN };
    const vmessLink = `vmess://${Buffer.from(JSON.stringify(VMESS)).toString('base64')}`;
    const vlessLink = `vless://${UUID}@${CFIP}:${CFPORT}?encryption=none&security=tls&sni=${ARGO_DOMAIN}&type=ws&host=${ARGO_DOMAIN}&path=%2Fvless-argo%3Fed%3D2560#${nodeName}`;
    const trojanLink = `trojan://${UUID}@${CFIP}:${CFPORT}?security=tls&sni=${ARGO_DOMAIN}&type=ws&host=${ARGO_DOMAIN}&path=%2Ftrojan-argo%3Fed%3D2560#${nodeName}`;
    
    const subContent = Buffer.from(`${vlessLink}\n${vmessLink}\n${trojanLink}`).toString('base64');
    
    app.get(`/${SUB_PATH}`, (req, res) => {
        res.set('Content-Type', 'text/plain; charset=utf-8');
        res.send(subContent);
    });
    console.log(`订阅生成成功: /${SUB_PATH}`);
}

// --- 主运行逻辑 ---
async function startserver() {
    try {
        console.log('正在初始化配置...');
        await generateConfig();
        console.log('正在下载核心文件...');
        await downloadFiles();
        console.log('正在生成订阅路由...');
        await generateLinks();
        
        // 启动 Xray 核心 (不再隐藏错误日志)
        console.log('正在启动 Xray 核心...');
        exec(`nohup ${webPath} -c ${configPath} &`);
        
        console.log('所有组件已就绪。');
    } catch (error) {
        console.error('启动失败:', error.message);
    }
}

// --- 启动服务 ---
app.listen(PORT, () => {
    console.log(`HTTP 服务已在端口 ${PORT} 启动`);
    startserver(); // 关键：确保函数被调用
});
