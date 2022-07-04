import { Config, readConfig } from './config';
import { createProgram } from './analyze';
import Path from 'path';

async function main() {
    const config = await readConfig(Path.resolve(__dirname, '../example/config.ts'));
    await createProgram(config);
}

main();