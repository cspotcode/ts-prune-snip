import { Config, readConfig } from './config';
import { createProgram } from './analyze';
import Path from 'path';

async function main() {
    const [, , configPath] = process.argv;
    const config = await readConfig(Path.resolve(configPath));
    await createProgram(config);
}

main();