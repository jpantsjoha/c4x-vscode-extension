/** Entry of dist/layoutWorker.js (#454): lays one view out in a worker thread. Never imports `vscode`. */
import { dagreLayoutEngine } from './DagreLayoutEngine';
import { runLayoutWorkerIfWorker } from './layoutDeadline';

runLayoutWorkerIfWorker((view, options) => {
    const layout = dagreLayoutEngine.layoutSync(view, options);
    return { layout, grewText: dagreLayoutEngine.layoutGrewText(layout) };
});
