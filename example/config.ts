export const config: import('../src/config').Config = {
    entrypoints: ['entrypoint*.*'],
    tsConfigPath: './tsconfig.json',
    sources: ["*.*"],
    emit: true,
}