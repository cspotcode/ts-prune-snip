import { Config } from "./bin";

export const config: Config = {
    gitReset: false,
    deleteFiles: [
        'src/index_ui_*'
    ],
    entrypoints: [
        'src/index_*'
    ],
};

export default config;