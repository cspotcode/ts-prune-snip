import { Config } from './config';
import { createProgram } from './create-program';
import Path from 'path';

async function main() {
    const cwd = Path.resolve(__dirname, '../example');
    const config = require('../example/config').config as Config;
    await createProgram(cwd, config);
}

main();