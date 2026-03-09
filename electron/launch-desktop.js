const { spawn } = require("child_process");
const path = require("path");

const electronBinary = require("electron");
const appRoot = path.join(__dirname, "..");
const env = { ...process.env };

delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronBinary, [appRoot], {
  stdio: "inherit",
  env,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
