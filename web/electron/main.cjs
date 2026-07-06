const { app, BrowserWindow, shell } = require("electron");
const path = require("node:path");

const devServerUrl = "http://127.0.0.1:3000";
const iconPath = path.join(__dirname, "icon.png");

function createWindow() {
    const window = new BrowserWindow({
        width: 1440,
        height: 900,
        minWidth: 1100,
        minHeight: 720,
        title: "Infinite Canvas",
        icon: iconPath,
        backgroundColor: "#f8f7f4",
        webPreferences: {
            preload: path.join(__dirname, "preload.cjs"),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
        },
    });

    window.setMenuBarVisibility(false);

    window.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith("http://") || url.startsWith("https://")) {
            shell.openExternal(url);
        }
        return { action: "deny" };
    });
    window.webContents.on("will-navigate", (event, url) => {
        if (url.startsWith(devServerUrl) || url.startsWith("file://")) return;
        if (!url.startsWith("http://") && !url.startsWith("https://")) return;

        event.preventDefault();
        shell.openExternal(url);
    });

    if (app.isPackaged) {
        window.loadFile(path.join(__dirname, "../dist/index.html"));
    } else {
        window.loadURL(devServerUrl);
    }
}

app.whenReady().then(() => {
    createWindow();

    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
});
