

export function getEnvValSafe(key: string): string {
    const endpoint = process.env[key]
    if (!endpoint)
        throw(`Missing env var ${key}`)
    return endpoint
}

export function fetchAbis(): Record<string, string> {
    const fs = require('fs')
    const path = require('path')
    const abis = {}

    const fetchAbisFromDir = (dir: string) => {
        fs.readdirSync(dir, { withFileTypes: true }).forEach(dirent => {
            const fullPath = path.join(dir, dirent.name);
            if (dirent.isDirectory()) {
                fetchAbisFromDir(fullPath);
            } else if (dirent.isFile() && dirent.name.endsWith('.json')) {
                const name: string = dirent.name.split('.')[0];
                const abi: string = require(fullPath);
                abis[name] = abi;
            }
        })
    }

    const abiDir: string = path.join(__dirname, './abi');
    fetchAbisFromDir(abiDir);
    
    return abis;
};