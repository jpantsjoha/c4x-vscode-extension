'use strict';
// Shared by esbuild.config.js and the tests that rebuild the render bundles in memory (#353).
const path = require('path');

/**
 * The render engine reaches modules that can see VS Code (ThemeManager, and
 * settings reads in the layout and SvgBuilder). In the headless bundles every
 * `vscode` import resolves to src/cli/headlessVscode.ts, which exports
 * nothing, so the bundles require no `vscode` module and load on bare Node
 * (#353, #352). Theme, spacing and edges-on-top are passed explicitly.
 */
function headlessVscodePlugin() {
    return {
        name: 'c4x-headless-vscode',
        setup(build) {
            build.onResolve({ filter: /^vscode$/ }, () => ({ path: path.join(__dirname, '..', 'src', 'cli', 'headlessVscode.ts') }));
            // lodash (through dagre) probes for Node's internal `util` binding at
            // load: `process.binding('util')`, a native-binding call the bundle
            // contract forbids. Its helper module may be undefined, and lodash
            // then uses its own type checks, so the headless bundles carry that
            // instead and never call process.binding.
            build.onLoad({ filter: /[\\/]lodash[\\/]_nodeUtil\.js$/ }, () => ({
                contents: '// Replaced by esbuild.config.js (headless bundles): no process.binding probe.\nmodule.exports = undefined;\n',
                loader: 'js',
            }));
        },
    };
}

module.exports = { headlessVscodePlugin };
