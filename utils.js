

module.exports.getEnvValSafe = (key, required=true) => {
    const endpoint = process.env[key];
    if (!endpoint && required)
        throw(`Missing env var ${key}`);
    return endpoint
}

module.exports.fetchAbis = () => {
    const fs = require('fs');
    const path = require('path');
    const abis = {};

    const fetchAbisFromDir = (dir) => {
        fs.readdirSync(dir, { withFileTypes: true }).forEach(dirent => {
            const fullPath = path.join(dir, dirent.name);
            if (dirent.isDirectory()) {
                fetchAbisFromDir(fullPath);
            } else if (dirent.isFile() && dirent.name.endsWith('.json')) {
                const name = dirent.name.split('.')[0];
                const abi = require(fullPath);
                abis[name] = abi;
            }
        });
    };

    const abiDir = path.join(__dirname, './abi');
    fetchAbisFromDir(abiDir);
    
    return abis;
};