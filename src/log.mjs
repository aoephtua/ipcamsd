// Copyright (c) 2022, Thorsten A. Weintz. All rights reserved.
// Licensed under the MIT license. See LICENSE in the project root for license information.

import chalk from 'chalk';

/**
 * Standard ouptput of process to write content.
 */
let stdout;

/**
 * Initializes standard output (stdout).
 */
const initStdout = () => {
    stdout = process.stdout;
};

/**
 * Prints content to stdout.
 * 
 * @param {string} content The content to print to stdout.
 * @param {function} style Function to style content print.
 */
const log = (content, style) => {
    if (stdout) {
        content = style?.(content) || content;

        stdout.write(content + '\n');
    }
};

/**
 * Prints message to stdout.
 * 
 * @param {string} content The content to print to stdout.
 */
const logMessage = (content) => log(content, chalk.cyan);

/**
 * Prints error to stdout.
 * 
 * @param {string} content The content to print to stdout.
 */
const logError = (content) => logMessage(`Error: ${content}`);

/**
 * Prints progress name and value to stdout.
 * 
 * @param {string} name The name of progress to stdout.
 * @param {string} value The value of progress to stdout.
 */
const writeProgress = (name, value) => {
    if (stdout) {
        stdout.clearLine();
        stdout.cursorTo(0);
        stdout.write(`${name ? `${name}: ` : ''}${value}`);
    }
};

/**
 * Prints newline to stdout on progress end.
 */
const endProgress = () => stdout?.write('\n');

/**
 * Exports primary log function as default.
 */
export default log;

/**
 * Exports secondary functions.
 */
export {
    initStdout,
    logMessage,
    logError,
    writeProgress,
    endProgress
};
