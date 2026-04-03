/** Write to stdout (user-facing data output). */
export function print(msg: string) { process.stdout.write(`${msg}\n`); }

/** Write to stderr (progress, status, errors). */
export function printError(msg: string) { process.stderr.write(`${msg}\n`); }
