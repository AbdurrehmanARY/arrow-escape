const fs = require('fs');
const lines = fs.readFileSync('.gitignore', 'utf8').split('\n');
console.log(lines.slice(64).join('\n'));