import fs from 'fs';
import FitParser from './dist/fit-parser.js';

const content = fs.readFileSync('../sports-lib/samples/fit/jumps-mtb.fit');
const fitParser = new (FitParser.default || FitParser)({ force: true, mode: 'both' });

fitParser.parse(content, (error, data) => {
    if (error) { console.error(error); return; }

    if (data.jumps && data.jumps.length > 0) {
        console.log(`Found ${data.jumps.length} jumps.`);
        data.jumps.forEach((j, i) => {
            // check for values close to 16.3038
            const target = 16.3038;
            const epsilon = 0.1;

            Object.entries(j).forEach(([key, val]) => {
                if (typeof val === 'number' && Math.abs(val - target) < epsilon) {
                    console.log(`MATCH INDEX ${i} KEY ${key}: ${val}`);
                }
            });

            // Also just print field 7 ('speed' in new def)
            console.log(`Jump ${i}: speed=${j.speed}`);
        });
    } else {
        console.log('No jumps found.');
    }
});
