import fs from "fs";
import path from "path";

function scanDir(dir) {
  const files = fs.readdirSync(dir);
  for (const f of files) {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) {
      if (f !== "node_modules" && f !== ".next" && f !== "generated") scanDir(full);
    } else if (f.endsWith(".ts") || f.endsWith(".tsx")) {
      const c = fs.readFileSync(full, "utf8");
      if (c.includes("payment.update") || c.includes("payment.delete") || c.includes("payments.delete")) {
        console.log("Found in:", full);
      }
    }
  }
}

scanDir("src");
