const fs = require('fs');
const FitParser = require('./dist/fit-parser.js').default;

const content = fs.readFileSync('../sports-lib/samples/fit/jumps-mtb.fit');
const fitParser = new FitParser({ force: true, mode: 'both' });

fitParser.parse(content, (error, data) => {
    if (error) { console.error(error); return; }
    
    function search(obj, path = '') {
        if (!obj || typeof obj !== 'object') return;
        for (const [key, value] of Object.entries(obj)) {
            const currentPath = path ? `${path}.${key}` : key;
            if (key === 'enhanced_mets') {
                console.log(`FOUND enhanced_mets at ${currentPath}: ${value}`);
            }
            search(value, currentPath);
        }
    }
    
    search(data);
    console.log('Search finished.');
});
