import fs from 'fs';
import FitParser from './dist/fit-parser.js';

const content = fs.readFileSync('../sports-lib/samples/fit/jumps-mtb.fit');
const fitParser = new (FitParser.default || FitParser)({ force: true, mode: 'both' });

fitParser.parse(content, (error, data) => {
    if (error) { console.error(error); return; }

    // The parser stores messages in data[messageName]
    // Any unknown messages are in data[messageId] (if numeric)
    console.log('Keys in data:', Object.keys(data));

    // Let's check for anything that looks like a message ID
    for (const key of Object.keys(data)) {
        if (!isNaN(parseInt(key))) {
            console.log(`Unknown Message ID found: ${key} (${data[key].length} items)`);
        }
    }

    if (data.jumps) {
        console.log('Jumps fields:', Object.keys(data.jumps[0]));
    }
});
