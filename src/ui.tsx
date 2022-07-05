import React from 'react';
import {observer} from 'mobx-react-lite';
import {makeAutoObservable} from 'mobx';
import {render, Text} from 'ink';
import { configure } from 'mobx';

// Simple react-based live readout of analysis progress

configure({
    enforceActions: 'never',
});

class UiState {
    constructor() {
        // makeAutoObservable(this);
    }
    tick = 0;
    maxLogLength = 5;
    filesInProjectCount = 0;
    analyzedCount = 0;
    analyzedReferencesCount = 0;
    currentAction: string = '';
    logLines: string[] = [];
    log(line: string) {
        this.logLines.push(line);
        if(this.logLines.length > this.maxLogLength) {
            this.logLines.shift();
        }
    }
}

export function createUi() {
    const state = new UiState();

    function start() {
        render(<Counter state={state}/>);
    }

    let i = 0;
    let lastTime = 0;
    function occasionallyAwait() {
        const now = +new Date;
        if(++i > 100 || lastTime + 100 < now) {
            i = 0;
            lastTime = now;
            return true;
        }
    }
    return {state, start, occasionallyAwait};
}

interface CounterProps { state: UiState; }
const Counter = observer((props: CounterProps) => {
    const {state} = props;
    return <>
        {state.logLines.map((line, i) => <Text key={i} color="green">{line}</Text>)}
        <Text color="blue">{state.currentAction}</Text>
        <Text>Files in project: {state.filesInProjectCount}</Text>
        <Text>Analyzed files: {state.analyzedCount}</Text>
        <Text>Analyzed references: {state.analyzedReferencesCount}</Text>
    </>;
});