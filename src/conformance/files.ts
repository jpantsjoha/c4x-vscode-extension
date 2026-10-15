/**
 * Finding the files `$code` globs match on disk, for the coverage check in
 * `conformFromDependencyCruiser` (`expectedSourceFiles`). VS Code-free.
 *
 * The on-disk count is a lower bound for the coverage guard: it only has to
 * be small enough that a healthy cruise is never flagged. So symbolic links
 * are not followed. Following them could only inflate the count (a link to a
 * parent such as `src/loop -> .` repeats every file, or loops) and raise a
 * false `incomplete-cruise` error. dependency-cruiser 18.4.0 keeps the link
 * path for a module found through a non-cyclic symlink and uses real paths
 * only for resolved dependency targets, so the two counts need not agree
 * file for file; a lower bound is all the guard needs.
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * Every regular file below `root` (relative to `cwd`), as `/`-separated
 * paths relative to `cwd`. Symbolic links, dot-folders and node_modules are
 * skipped; a `root` that is itself a file is returned as is.
 */
export function listFilesNoSymlinks(cwd: string, root: string): string[] {
    let stat: fs.Stats;
    try {
        // Paths are the workspace's own folders, named by validated $code globs and directory listings.
        // eslint-disable-next-line security/detect-non-literal-fs-filename
        stat = fs.lstatSync(path.join(cwd, root));
    } catch {
        return [];
    }
    if (stat.isSymbolicLink()) {
        return [];
    }
    if (!stat.isDirectory()) {
        return stat.isFile() ? [root] : [];
    }
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    return fs.readdirSync(path.join(cwd, root), { withFileTypes: true })
        .filter(entry => !entry.name.startsWith('.') && entry.name !== 'node_modules')
        .flatMap(entry => listFilesNoSymlinks(cwd, `${root}/${entry.name}`));
}

/**
 * Collapse paths found through symbolic links onto their real location, as
 * dependency-cruiser does. `realpathOf` maps an absolute path to its real
 * absolute path (or undefined when it cannot be resolved); results outside
 * `root` are dropped. Returns unique `/`-separated paths relative to `root`.
 */
export function realRelativePaths(
    absolutePaths: readonly string[],
    root: string,
    realpathOf: (absolute: string) => string | undefined,
): string[] {
    const realRoot = realpathOf(root) ?? root;
    const result = new Set<string>();
    for (const absolute of absolutePaths) {
        const real = realpathOf(absolute);
        if (!real) {
            continue;
        }
        const relative = path.relative(realRoot, real);
        if (relative === '' || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
            continue;
        }
        result.add(relative.split(path.sep).join('/'));
    }
    return [...result];
}
