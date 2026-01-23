import fs from 'fs';
import FitParser from './dist/fit-parser.js';

const content = fs.readFileSync('../sports-lib/samples/fit/jumps-mtb.fit');
// Try both ways to instantiate
const fitParser = new (FitParser.default || FitParser)({ force: true, mode: 'both' });

fitParser.parse(content, (error, data) => {
    if (error) { console.error(error); return; }

    function search(obj, path = '') {
        if (!obj || typeof obj !== 'object') return;
        if (Array.isArray(obj)) {
            obj.forEach((item, index) => search(item, `${path}[${index}]`));
            return;
        }
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
