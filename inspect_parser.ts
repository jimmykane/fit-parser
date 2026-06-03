
import FitParser from './src/fit-parser';
import * as fs from 'fs';

const filePath = 'examples/road-with-power.fit';

async function run() {
    try {
        const content = fs.readFileSync(filePath);
        const parser = new FitParser({
            force: true,
        });

        parser.parse(content, (error: any, data: any) => {
            if (error) {
                console.error(error);
            } else {
                console.log('Parsed successfully');
                // Check sessions for power zone data
                if (data.sessions && data.sessions.length > 0) {
                    const session = data.sessions[0];
                    console.log('Session keys:', Object.keys(session));
                    console.log('time_in_power_zone:', session.time_in_power_zone);
                    console.log('time_in_hr_zone:', session.time_in_hr_zone);
                    console.log('time_in_speed_zone:', session.time_in_speed_zone);
                }
            }
        });
    } catch (e) {
        console.error(e);
    }
}

run();
